#!/usr/bin/env node
// Smoke-test every `mnotes <cmd>` reference in skills/ + agents/ against the real CLI.
//
// Pinned CLI version — bump deliberately (PR-reviewable).
const PINNED_CLI = "mnotes-cli@4.1.1";

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SCAN_DIRS = ["skills", "agents"];

// Top-level command tokens that exist in the CLI. We use this list to seed the
// extractor: a match is only kept if its first token is one of these.
// Sourced from `mnotes --help` against the pinned version, see CLI_TOPLEVEL below.
// Filled at runtime — see ensureCliInstalled().
let CLI_TOPLEVEL = new Set();

// Lines that look like placeholders rather than real invocations.
function isPlaceholder(token) {
  return /^[<\[*]/.test(token) || token.includes("...") || token.toUpperCase() === token;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

// Extract candidate command paths from a single line of text.
// Returns an array of { path: string[], col: number }.
function extractFromLine(line) {
  const out = [];
  // \b mnotes (token)+ — up to 3 sub-tokens after `mnotes`. Tokens are kebab-case lowercase.
  const re = /\bmnotes(?:\s+([a-z][a-z0-9-]*)){1,3}/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    // Re-tokenize the full match — JS regex only captures the last group repetition.
    const tokens = m[0].split(/\s+/).slice(1);
    // Trim trailing tokens that look like placeholders or args, leaving only
    // real command path tokens.
    const clean = [];
    for (const t of tokens) {
      if (isPlaceholder(t)) break;
      clean.push(t);
    }
    if (clean.length === 0) continue;
    out.push({ path: clean, col: m.index });
  }
  return out;
}

function ensureCliInstalled() {
  // Install the pinned CLI to a local sandbox so we never touch the user's global.
  // CI is fast enough that we re-install every run.
  const local = join(ROOT, ".mnotes-cli-sandbox");
  try {
    if (!existsSync(local)) mkdirSync(local, { recursive: true });
    const pkg = join(local, "package.json");
    if (!existsSync(pkg)) {
      writeFileSync(pkg, JSON.stringify({ name: "mnotes-cli-sandbox", private: true, version: "0.0.0" }, null, 2));
    }
    execSync(`npm install --silent --no-audit --no-fund ${PINNED_CLI}`, {
      cwd: local,
      stdio: "inherit",
    });
  } catch (e) {
    console.error(`failed to install ${PINNED_CLI}:`, e.message);
    process.exit(2);
  }
  const bin = join(local, "node_modules", ".bin", "mnotes");
  // Discover top-level commands so we filter false positives.
  const help = spawnSync(bin, ["--help"], { encoding: "utf8" });
  if (help.status !== 0) {
    console.error("mnotes --help failed");
    console.error(help.stderr || help.stdout);
    process.exit(2);
  }
  // Parse "Commands:" section.
  const m = help.stdout.match(/Commands:\s*\n([\s\S]*?)(?:\n\n|$)/);
  if (m) {
    for (const ln of m[1].split("\n")) {
      const w = ln.trim().split(/\s+/)[0];
      if (w && /^[a-z][a-z0-9-]*$/.test(w)) CLI_TOPLEVEL.add(w);
    }
  }
  // Always allow `help` even if commander doesn't list it.
  CLI_TOPLEVEL.add("help");
  return bin;
}

function runHelp(bin, path) {
  const res = spawnSync(bin, [...path, "--help"], { encoding: "utf8" });
  return { ok: res.status === 0, stderr: res.stderr, stdout: res.stdout };
}

// Commander silently falls back to the parent group's help when given an
// unknown subcommand (`mnotes wiki log-tail --help` prints `mnotes wiki` help
// and exits 0). So `--help` exit code alone is not enough. Instead, walk the
// command tree: at each level, parse the parent's `Commands:` block and
// require the next token to be listed there.
const subcommandCache = new Map();
function parseSubcommands(stdout) {
  const m = stdout.match(/Commands:\s*\n([\s\S]*?)(?:\n\n|\n$|$)/);
  if (!m) return new Set();
  const out = new Set();
  for (const ln of m[1].split("\n")) {
    const w = ln.trim().split(/\s+/)[0];
    if (w && /^[a-z][a-z0-9-]*$/.test(w)) out.add(w);
  }
  return out;
}
function getSubcommands(bin, path) {
  const key = path.join(" ");
  if (subcommandCache.has(key)) return subcommandCache.get(key);
  const r = runHelp(bin, path);
  if (!r.ok) { subcommandCache.set(key, null); return null; }
  const set = parseSubcommands(r.stdout);
  subcommandCache.set(key, set);
  return set;
}
function validatePath(bin, path) {
  // Walk root → ... → path; at each step verify the next token exists in the
  // parent's subcommand list.
  for (let i = 0; i < path.length; i++) {
    const parent = path.slice(0, i);
    const subs = getSubcommands(bin, parent);
    if (!subs) return { ok: false, where: `mnotes ${parent.join(" ")} --help failed` };
    if (!subs.has(path[i])) {
      return { ok: false, where: `\`${path[i]}\` is not a subcommand of \`mnotes ${parent.join(" ") || ""}\`` };
    }
  }
  return { ok: true };
}

function main() {
  const bin = ensureCliInstalled();
  console.log(`✓ ${PINNED_CLI} installed; top-level commands: ${[...CLI_TOPLEVEL].sort().join(", ")}`);

  // Collect all references with file:line context.
  const refs = []; // { path: string[], file, line }
  const files = [];
  for (const d of SCAN_DIRS) {
    try { files.push(...walk(join(ROOT, d))); } catch { /* dir may not exist */ }
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      for (const ref of extractFromLine(line)) {
        if (!CLI_TOPLEVEL.has(ref.path[0])) continue; // alien first token — placeholder
        refs.push({ path: ref.path, file: relative(ROOT, file), line: i + 1 });
      }
    });
  }

  if (refs.length === 0) {
    console.error("no `mnotes <cmd>` references found in skills/ or agents/ — extractor probably broken");
    process.exit(2);
  }

  // Dedupe by command path (string join).
  const byKey = new Map();
  for (const r of refs) {
    const key = r.path.join(" ");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  console.log(`✓ found ${refs.length} references across ${byKey.size} unique command paths`);

  // For each unique path, require `mnotes <path> --help` to succeed exactly.
  // The extractor already stops at flags and placeholders, so any remaining
  // path should be a real command. A trailing token that isn't a real
  // subcommand (e.g. a doc mistakenly writing `mnotes wiki log-tail`) must
  // surface as a failure here — that's the whole point of the check.
  const failures = [];
  for (const [key, sites] of byKey) {
    const path = key.split(" ");
    const r = validatePath(bin, path);
    if (!r.ok) failures.push({ key, sites, reason: r.where });
  }

  if (failures.length > 0) {
    console.error("\n✗ broken `mnotes` references:");
    for (const f of failures) {
      console.error(`  - "mnotes ${f.key}" — ${f.reason}`);
      for (const s of f.sites.slice(0, 3)) {
        console.error(`      at ${s.file}:${s.line}`);
      }
      if (f.sites.length > 3) console.error(`      ...and ${f.sites.length - 3} more`);
    }
    process.exit(1);
  }

  console.log(`\n✓ all ${byKey.size} unique \`mnotes <cmd>\` references parse against ${PINNED_CLI}`);
}

main();
