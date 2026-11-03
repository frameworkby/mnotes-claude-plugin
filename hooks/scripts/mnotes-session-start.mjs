#!/usr/bin/env node
// SessionStart hook: loads project context on Claude Code session start and emits
// it as additionalContext via the SessionStart hook JSON envelope so Claude Code
// injects it into the session.
// Workspace is resolved at runtime: MNOTES_WORKSPACE_ID env → per-cwd config map → global default.
//
// Also appends a "Code graph" section from `mnotes code status --json` (run in
// parallel with project-load, 4s timeout) and, when the build is stale and
// graphify is installed, starts `mnotes code refresh --if-stale` in the
// background. The status is cached per session for the PreToolUse hook.
//
// Always exits 0 — never blocks Claude Code from starting.

import { spawn } from "node:child_process";
import {
  STATUS_KEY,
  cacheSet,
  findRepoRoot,
  hasGraphify,
  maybeBackgroundRefresh,
  readStdin,
  resolveMnotes,
  resolveMnotesAny,
  runMnotesJson,
} from "./lib/code-graph.mjs";

function clip(s, max) {
  if (typeof s !== "string") return s;
  if (s.length > max) return s.slice(0, max) + "…";
  return s;
}

function buildDigest(payload, limit, excerptMax) {
  const d = (payload && typeof payload === "object" && payload.data) || payload || {};
  const sections = ["# m-notes: project context"];

  const knowledge = Array.isArray(d.knowledge) ? d.knowledge : [];
  if (knowledge.length > 0) {
    const shown = Math.min(limit, knowledge.length);
    const lines = knowledge.slice(0, shown).map((k) => {
      const title = k.title || k.key || "(untitled)";
      const excerpt = k.excerpt ? ` — ${clip(k.excerpt, excerptMax)}` : "";
      return `- **${title}**${excerpt}`;
    });
    sections.push(
      `## Knowledge (top ${shown} of ${knowledge.length})\n` + lines.join("\n"),
    );
  }

  const stale = Array.isArray(d.stale_entries) ? d.stale_entries : [];
  if (stale.length > 0) {
    sections.push(`## Stale entries: ${stale.length}`);
  }

  const ctx = d.context && typeof d.context === "object" ? d.context : null;
  if (ctx && Object.keys(ctx).length > 0) {
    sections.push("## Context\n```json\n" + JSON.stringify(ctx) + "\n```");
  }

  return sections.filter((s) => s != null && s !== "").join("\n\n");
}

// project-load may go through the plugin's npx-backed wrapper, so users without
// a global install still get context. Spawned with shell:false; on Windows the
// .cmd shim is unwrapped to `node <entry>` (see lib/code-graph.mjs).
function projectLoad(timeoutMs) {
  return new Promise((resolve) => {
    const bin = resolveMnotesAny();
    let child;
    let out = "";
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      try { child && child.kill(); } catch {}
      finish(null);
    }, timeoutMs);
    try {
      child = spawn(bin.cmd, [...bin.prefix, "composite", "project-load", "--query", "session start"], {
        stdio: ["ignore", "pipe", "ignore"],
        shell: false,
        windowsHide: true,
      });
    } catch {
      return finish(null);
    }
    child.on("error", () => finish(null));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => (out += c));
    child.on("close", (code) => {
      if (code !== 0) return finish(null);
      try {
        finish(JSON.parse(out.trim()));
      } catch {
        finish(null);
      }
    });
  });
}

function shortSha(s) {
  return typeof s === "string" ? s.slice(0, 12) : "";
}

// Returns the "Code graph" markdown section, or null to omit it.
async function codeGraphSection(payload) {
  const sid = payload.session_id;
  const cwd = payload.cwd || process.cwd();
  const root = findRepoRoot(cwd);
  if (!root) return null; // not in a repo: nothing to graph
  if (!resolveMnotes()) {
    cacheSet(sid, STATUS_KEY, { state: "unavailable", repoRoot: root });
    return null;
  }
  const status = await runMnotesJson(["code", "status", "--json"], { cwd: root });
  if (!status || typeof status !== "object") {
    // Old CLI without `mnotes code`, auth/network failure or timeout.
    cacheSet(sid, STATUS_KEY, { state: "unavailable", repoRoot: root });
    return null;
  }
  const repoRoot = (typeof status.repoRoot === "string" && status.repoRoot) || root;
  const b = status.build;
  if (!b || typeof b !== "object") {
    cacheSet(sid, STATUS_KEY, { state: "nobuild", repoRoot });
    return (
      "## Code graph\n" +
      "No m-notes code graph exists for this repo yet. Run `/mnotes:graphify` (or `mnotes code refresh`) " +
      "to build one; after that `mnotes code search/show/impact` answer 'where is X / who uses X' directly."
    );
  }
  cacheSet(sid, STATUS_KEY, { state: "build", repoRoot, buildId: b.id });

  const behind = Number.isInteger(status.behind) ? status.behind : null;
  // CLI ≥ 4.6.0: `stale` = commits behind only; uncommitted edits are `dirty`.
  let fresh;
  if (behind === null) fresh = "build commit not found locally, freshness unknown";
  else if (behind === 0) fresh = "up to date with HEAD";
  else fresh = `${behind} commit(s) behind HEAD`;
  if (status.dirty === true) fresh += "; uncommitted changes are not in the graph";

  let refreshLine = "";
  if (status.stale) {
    if (maybeBackgroundRefresh(repoRoot)) {
      refreshLine = "\nA background `mnotes code refresh --if-stale` was started; results for recently changed code may lag until it finishes.";
    } else if (!hasGraphify()) {
      refreshLine = "\nThe build is stale and graphify is not installed, so it was not refreshed. `/mnotes:graphify` rebuilds it.";
    }
  }

  const sha = shortSha(b.commitSha);
  return (
    "## Code graph\n" +
    `Build \`${b.name || "?"}\`${sha ? ` @ ${sha}` : ""} (${fresh}).` +
    refreshLine +
    "\n\nBefore exploring or changing code, use `mnotes code search/show/impact`; prefer it over broad Grep/Glob " +
    "for 'where is X / who uses X'. Before editing a file, run `mnotes code impact <file>`."
  );
}

(async () => {
  try {
    if (!process.env.MNOTES_WORKSPACE_ID) {
      process.stderr.write(
        "mnotes-session-start: MNOTES_WORKSPACE_ID not set — workspace will be resolved from config\n",
      );
    }

    const limit = parseInt(process.env.MNOTES_SESSION_START_LIMIT || "10", 10) || 10;
    const excerptMax =
      parseInt(process.env.MNOTES_SESSION_START_EXCERPT || "240", 10) || 240;

    let payload = {};
    try {
      // Claude Code always pipes a JSON envelope; guard against a TTY so a
      // manual run doesn't hang.
      if (!process.stdin.isTTY) payload = JSON.parse((await readStdin()) || "{}") || {};
    } catch {
      payload = {};
    }

    const [loaded, codeSection] = await Promise.all([
      projectLoad(20000),
      codeGraphSection(payload).catch(() => null),
    ]);

    const sections = [];
    if (loaded) {
      const digest = buildDigest(loaded, limit, excerptMax);
      if (digest) sections.push(digest);
    }
    if (codeSection) {
      if (sections.length === 0) sections.push("# m-notes: project context");
      sections.push(codeSection);
    }
    if (sections.length > 0) {
      const out = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: sections.join("\n\n"),
        },
      });
      await new Promise((r) => process.stdout.write(out, r));
    }
  } catch {
    // never block session start
  }
  process.exit(0);
})();
