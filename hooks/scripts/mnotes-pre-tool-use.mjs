#!/usr/bin/env node
// PreToolUse hook: pushes the agent onto the m-notes code graph.
//
//   Edit|Write|MultiEdit|NotebookEdit → inject the files that depend on the file
//     about to change (`mnotes code impact <file> --depth 1 --json`), once per
//     (session, file). Context only: no permissionDecision, so the normal
//     permission flow is untouched.
//   Grep|Glob → first time per session, a one-line reminder to use
//     `mnotes code search`. With MNOTES_CODE_GRAPH=strict, deny Grep/Glob until
//     some `mnotes code …` Bash command has run in the session (the PostToolUse
//     hook records that marker).
//
// Fails open and always exits 0. When `mnotes` is missing, or SessionStart found
// no build, this returns without spawning anything.

import fs from "node:fs";
import path from "node:path";
import {
  STATUS_KEY,
  cacheGet,
  cacheSet,
  findRepoRoot,
  firstTime,
  hasMarker,
  isCodeFile,
  readStdin,
  repoRelative,
  resolveMnotes,
  runMnotesJson,
} from "./lib/code-graph.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SEARCH_TOOLS = new Set(["Grep", "Glob"]);
const MAX_FILES = 15;
const MAX_FAILURES = 2;

let pendingOutput = null;
function emit(obj) {
  pendingOutput = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...obj } });
}

function formatImpact(rel, impact) {
  const files = (Array.isArray(impact && impact.files) ? impact.files : []).filter(
    (f) => f && f.sourceFile && f.sourceFile !== rel,
  );
  if (files.length === 0) return null;
  const shown = files.slice(0, MAX_FILES).map((f) => {
    const n = Number(f.count) > 1 ? ` (${f.count} refs)` : "";
    return `- ${f.sourceFile}${n}`;
  });
  const more = files.length > MAX_FILES ? `\n- …and ${files.length - MAX_FILES} more` : "";
  const trunc = impact.truncated ? " The list is truncated." : "";
  return (
    `m-notes code graph: ${files.length} file(s) directly depend on ${rel}.${trunc}\n` +
    shown.join("\n") +
    more +
    `\nIf this edit changes a signature, export or behaviour they rely on, check these files. ` +
    `Wider view: \`mnotes code impact ${rel} --depth 2\`.`
  );
}

async function onEdit(payload, status) {
  const input = payload.tool_input || {};
  const raw = input.file_path || input.notebook_path;
  if (!raw || typeof raw !== "string") return;
  const cwd = payload.cwd || process.cwd();
  const file = path.resolve(cwd, raw);
  if (!isCodeFile(file)) return;
  // A file that doesn't exist yet (Write creating it) has no dependents.
  if (!fs.existsSync(file)) return;

  const root = (status && status.repoRoot) || findRepoRoot(cwd);
  if (!root) return;
  const rel = repoRelative(root, file);
  if (!rel) return; // outside the repo

  const sid = payload.session_id;
  const key = `impact:${rel}`;
  const cached = cacheGet(sid, key);
  if (cached !== undefined) return; // one call (and one injection) per file per session

  const failures = cacheGet(sid, "impact-failures") || 0;
  if (failures >= MAX_FAILURES) return;

  const impact = await runMnotesJson(["code", "impact", rel, "--depth", "1", "--json"], { cwd: root });
  if (!impact) {
    cacheSet(sid, "impact-failures", failures + 1);
    return;
  }
  // `notInGraph: true` (the API's 404 for a file missing from the build: new
  // file or stale graph) comes back with empty `files`, which means no dependents
  // to report. It is not an error, so it does not count toward MAX_FAILURES.
  const text = formatImpact(rel, impact);
  cacheSet(sid, key, text ? 1 : 0);
  if (text) emit({ additionalContext: text });
}

function onSearch(payload, status) {
  // Only when SessionStart confirmed a build exists: otherwise the hint (and
  // especially a deny) would point the agent at nothing.
  if (!status || status.state !== "build") return;
  const sid = payload.session_id;
  if (process.env.MNOTES_CODE_GRAPH === "strict" && !hasMarker(sid, "used-code")) {
    emit({
      permissionDecision: "deny",
      permissionDecisionReason:
        "MNOTES_CODE_GRAPH=strict: this repo has an m-notes code graph. Run `mnotes code search <name> --json` " +
        "(or `mnotes code show` / `mnotes code impact`) first for 'where is X / who uses X'; Grep/Glob unlock after that.",
    });
    return;
  }
  if (firstTime(sid, "grep-hint")) {
    emit({
      additionalContext:
        "This repo has an m-notes code graph. For symbol and usage questions ('where is X defined', 'who calls X'), " +
        "`mnotes code search <name>` and `mnotes code show <name>` answer directly; Grep/Glob remain fine for text search.",
    });
  }
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const tool = payload.tool_name || "";
    if (!EDIT_TOOLS.has(tool) && !SEARCH_TOOLS.has(tool)) return;

    const status = cacheGet(payload.session_id, STATUS_KEY);
    if (status && status.state !== "build") return; // no build / no CLI: zero cost
    if (!resolveMnotes()) return;

    if (EDIT_TOOLS.has(tool)) await onEdit(payload, status);
    else onSearch(payload, status);
  } catch {
    // fail open
  }
})()
  .catch(() => {})
  .finally(() => {
    // Exit only after stdout is flushed (pipe writes can be async).
    if (pendingOutput) process.stdout.write(pendingOutput, () => process.exit(0));
    else process.exit(0);
  });
