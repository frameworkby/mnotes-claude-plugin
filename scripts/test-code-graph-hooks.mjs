#!/usr/bin/env node
// Tests for the code-graph hooks: SessionStart "Code graph" section and
// background refresh, PreToolUse edit impact / Grep-Glob nudge / strict mode,
// and the PostToolUse Bash marker + post-commit refresh.
//
// `mnotes` and `graphify` are stubbed on PATH (POSIX shell shim + Windows .cmd
// shim around scripts/fixtures/mnotes-stub.mjs). The stub answers
// `mnotes code status|impact|refresh --json` with the shapes from the contract
// and logs every invocation (argv + cwd) to a JSONL file.
//
// Usage: node scripts/test-code-graph-hooks.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOOKS = path.join(ROOT, "hooks", "scripts");
const SESSION_START = path.join(HOOKS, "mnotes-session-start.mjs");
const PRE = path.join(HOOKS, "mnotes-pre-tool-use.mjs");
const POST = path.join(HOOKS, "mnotes-post-tool-use.mjs");
const STUB = path.join(__dirname, "fixtures", "mnotes-stub.mjs");
const isWindows = process.platform === "win32";

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "mnotes-code-hooks-test-"));
process.on("exit", () => {
  try {
    fs.rmSync(WORK, { recursive: true, force: true });
  } catch {}
});

// ── PATH stubs ───────────────────────────────────────────────────────────────

function makeShim(dir, name, script) {
  fs.mkdirSync(dir, { recursive: true });
  if (isWindows) {
    fs.writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "%~dp0\\${path.basename(script)}" %*\r\n`);
  } else {
    const p = path.join(dir, name);
    fs.writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "\${0%/*}/${path.basename(script)}" "$@"\n`);
    fs.chmodSync(p, 0o755);
  }
  fs.copyFileSync(script, path.join(dir, path.basename(script)));
}

const MNOTES_DIR = path.join(WORK, "bin-mnotes");
const GRAPHIFY_DIR = path.join(WORK, "bin-graphify");
const EMPTY_DIR = path.join(WORK, "bin-empty");
makeShim(MNOTES_DIR, "mnotes", STUB);
makeShim(GRAPHIFY_DIR, "graphify", STUB);
fs.mkdirSync(EMPTY_DIR, { recursive: true });

// ── Fixtures ─────────────────────────────────────────────────────────────────

let n = 0;
function fresh(label) {
  n += 1;
  const dir = path.join(WORK, `case-${n}-${label}`);
  const repo = path.join(dir, "repo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  for (const f of ["src/a.ts", "src/b.ts", "README.md"]) fs.writeFileSync(path.join(repo, f), "x\n");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "c.ts"), "x\n");
  const tmp = path.join(dir, "tmp");
  const home = path.join(dir, "home");
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { dir, repo, outside, tmp, home, log: path.join(dir, "calls.jsonl"), sid: `sid-${n}-${Date.now()}` };
}

function run(script, c, payload, { mode = "build", path: pathDirs = [MNOTES_DIR, GRAPHIFY_DIR], env = {} } = {}) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ session_id: c.sid, cwd: c.repo, ...payload }),
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...(isWindows ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}), // Windows needs it to spawn anything
      PATH: pathDirs.join(path.delimiter),
      TMPDIR: c.tmp,
      TEMP: c.tmp,
      TMP: c.tmp,
      HOME: c.home,
      USERPROFILE: c.home,
      MNOTES_STUB_LOG: c.log,
      MNOTES_STUB_MODE: mode,
      ...env,
    },
  });
  const ms = Date.now() - started;
  assert.equal(res.status, 0, `hook exited ${res.status}: ${res.stderr}`);
  let out = null;
  if (res.stdout.trim()) out = JSON.parse(res.stdout);
  return { out, ms, ctx: out?.hookSpecificOutput?.additionalContext || "", hso: out?.hookSpecificOutput };
}

function calls(c) {
  try {
    return fs
      .readFileSync(c.log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const codeCalls = (c, sub) => calls(c).filter((x) => x.args[0] === "code" && (!sub || x.args[1] === sub));

function waitFor(pred, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},100)"]);
  }
  return pred();
}

const startSession = (c, opts) => run(SESSION_START, c, { hook_event_name: "SessionStart", source: "startup" }, opts);
const edit = (c, file, opts, tool = "Edit") =>
  run(PRE, c, { hook_event_name: "PreToolUse", tool_name: tool, tool_input: { file_path: file } }, opts);
const grep = (c, opts) =>
  run(PRE, c, { hook_event_name: "PreToolUse", tool_name: "Grep", tool_input: { pattern: "foo" } }, opts);
const bash = (c, command, opts) =>
  run(POST, c, { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, tool_response: { stdout: "" } }, opts);

// ── SessionStart ─────────────────────────────────────────────────────────────

test("SessionStart: fresh build → Code graph section with name, sha, rule; no refresh", () => {
  const c = fresh("ss-fresh");
  const r = startSession(c);
  assert.match(r.ctx, /## Code graph/);
  assert.match(r.ctx, /Build `repo` @ abc1234/);
  assert.match(r.ctx, /up to date with HEAD/);
  assert.match(r.ctx, /mnotes code search\/show\/impact/);
  assert.match(r.ctx, /run `mnotes code impact <file>`/);
  assert.match(r.ctx, /Stub knowledge/, "project-load digest still present");
  const st = codeCalls(c, "status");
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].args, ["code", "status", "--json"]);
  assert.equal(fs.realpathSync(st[0].cwd), fs.realpathSync(c.repo));
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 800), "no refresh for a fresh build");
});

test("SessionStart: stale build + graphify → detached refresh --if-stale", () => {
  const c = fresh("ss-stale");
  const r = startSession(c, { mode: "stale" });
  assert.match(r.ctx, /3 commit\(s\) behind HEAD/);
  assert.match(r.ctx, /background `mnotes code refresh --if-stale` was started/);
  assert.ok(waitFor(() => codeCalls(c, "refresh").length === 1), "refresh spawned");
  assert.deepEqual(codeCalls(c, "refresh")[0].args, ["code", "refresh", "--if-stale"]);
});

test("SessionStart: stale build + MNOTES_CODE_AUTO_REFRESH=0 → no refresh", () => {
  const c = fresh("ss-noauto");
  const r = startSession(c, { mode: "stale", env: { MNOTES_CODE_AUTO_REFRESH: "0" } });
  assert.match(r.ctx, /behind HEAD/);
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 1000));
});

test("SessionStart: stale build without graphify → no refresh, says why", () => {
  const c = fresh("ss-nographify");
  const r = startSession(c, { mode: "stale", path: [MNOTES_DIR] });
  assert.match(r.ctx, /graphify is not installed/);
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 1000));
});

test("SessionStart: dirty tree but not behind → noted, no refresh", () => {
  const c = fresh("ss-dirty");
  const r = startSession(c, { mode: "dirty" });
  assert.match(r.ctx, /up to date with HEAD; uncommitted changes are not in the graph/);
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 1000));
});

test("SessionStart: no build → tells the agent to run /mnotes:graphify", () => {
  const c = fresh("ss-nobuild");
  const r = startSession(c, { mode: "nobuild" });
  assert.match(r.ctx, /No m-notes code graph exists/);
  assert.match(r.ctx, /\/mnotes:graphify/);
});

test("SessionStart: outside a git repo → no status call, no section", () => {
  const c = fresh("ss-norepo");
  fs.rmSync(path.join(c.repo, ".git"), { recursive: true });
  const r = startSession(c);
  assert.doesNotMatch(r.ctx, /Code graph/);
  assert.equal(codeCalls(c, "status").length, 0);
});

test("SessionStart: CLI without `mnotes code` (status fails) → section omitted", () => {
  const c = fresh("ss-oldcli");
  const r = startSession(c, { mode: "fail" });
  assert.doesNotMatch(r.ctx, /Code graph/);
  assert.match(r.ctx, /Stub knowledge/);
});

test("SessionStart: mnotes missing → exits 0 fast with no output", () => {
  const c = fresh("ss-missing");
  const r = startSession(c, { path: [EMPTY_DIR] });
  assert.equal(r.out, null);
  assert.ok(r.ms < 3000, `took ${r.ms}ms`);
});

test("SessionStart: slow `code status` is cut off by the 4s timeout", () => {
  const c = fresh("ss-slow");
  const r = startSession(c, { mode: "slow" });
  assert.doesNotMatch(r.ctx, /Code graph/);
  assert.ok(r.ms < 7000, `took ${r.ms}ms`);
});

// ── PreToolUse: edit impact ──────────────────────────────────────────────────

test("Edit: injects top-15 dependents once per (session, file)", () => {
  const c = fresh("edit");
  startSession(c);
  const file = path.join(c.repo, "src", "a.ts");
  const r = edit(c, file);
  assert.equal(r.hso.hookEventName, "PreToolUse");
  assert.equal(r.hso.permissionDecision, undefined, "context only, no permission decision");
  assert.match(r.ctx, /20 file\(s\) directly depend on src\/a\.ts/);
  assert.match(r.ctx, /- src\/dep01\.ts \(2 refs\)/);
  assert.match(r.ctx, /- src\/dep15\.ts/);
  assert.doesNotMatch(r.ctx, /dep16/);
  assert.match(r.ctx, /…and 5 more/);
  assert.doesNotMatch(r.ctx, /- src\/a\.ts/, "the edited file itself is not listed");
  const imp = codeCalls(c, "impact");
  assert.equal(imp.length, 1);
  assert.deepEqual(imp[0].args, ["code", "impact", "src/a.ts", "--depth", "1", "--json"]);
  assert.equal(fs.realpathSync(imp[0].cwd), fs.realpathSync(c.repo));

  const again = edit(c, file, {}, "Write");
  assert.equal(again.out, null);
  assert.equal(codeCalls(c, "impact").length, 1, "cached: no second call");

  edit(c, path.join(c.repo, "src", "b.ts"), {}, "MultiEdit");
  assert.equal(codeCalls(c, "impact").length, 2, "other file → new call");
});

test("Edit: relative path is resolved against cwd", () => {
  const c = fresh("edit-rel");
  startSession(c);
  const r = edit(c, "src/a.ts");
  assert.match(r.ctx, /depend on src\/a\.ts/);
});

test("NotebookEdit: notebook_path is honoured (non-code .ipynb skipped)", () => {
  const c = fresh("nb");
  startSession(c);
  fs.writeFileSync(path.join(c.repo, "n.ipynb"), "{}");
  run(PRE, c, { tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(c.repo, "n.ipynb") } });
  assert.equal(codeCalls(c, "impact").length, 0);
});

test("Edit: non-code file, file outside repo, not-yet-existing file → no call", () => {
  const c = fresh("edit-skip");
  startSession(c);
  assert.equal(edit(c, path.join(c.repo, "README.md")).out, null);
  assert.equal(edit(c, path.join(c.outside, "c.ts")).out, null);
  assert.equal(edit(c, path.join(c.repo, "src", "new.ts"), {}, "Write").out, null);
  assert.equal(codeCalls(c, "impact").length, 0);
});

test("Edit: no dependents → no output, still cached", () => {
  const c = fresh("edit-none");
  startSession(c);
  const r = edit(c, path.join(c.repo, "src", "b.ts"), { mode: "noimpact" });
  assert.equal(r.out, null);
  edit(c, path.join(c.repo, "src", "b.ts"), { mode: "noimpact" });
  assert.equal(codeCalls(c, "impact").length, 1);
});

test("Edit: file not in the graph (notInGraph) → silent, cached, not counted as a failure", () => {
  const c = fresh("edit-notingraph");
  startSession(c);
  const a = path.join(c.repo, "src", "a.ts");
  assert.equal(edit(c, a, { mode: "notingraph" }).out, null);
  assert.equal(edit(c, a, { mode: "notingraph" }).out, null);
  assert.equal(codeCalls(c, "impact").length, 1, "cached per file");
  // Not a failure: later files still get looked up (failure cap is 2).
  edit(c, path.join(c.repo, "src", "b.ts"), { mode: "notingraph" });
  const r = edit(c, path.join(c.repo, "src", "b.ts"));
  assert.equal(codeCalls(c, "impact").length, 2);
  assert.equal(r.out, null);
  fs.writeFileSync(path.join(c.repo, "src", "c.ts"), "x\n");
  const r3 = edit(c, path.join(c.repo, "src", "c.ts"));
  assert.match(r3.ctx, /depend on src\/c\.ts/);
});

test("Edit: SessionStart found no build → zero calls", () => {
  const c = fresh("edit-nobuild");
  startSession(c, { mode: "nobuild" });
  assert.equal(edit(c, path.join(c.repo, "src", "a.ts"), { mode: "nobuild" }).out, null);
  assert.equal(codeCalls(c, "impact").length, 0);
});

test("Edit: impact keeps failing → gives up after 2 calls for the session", () => {
  const c = fresh("edit-fail");
  startSession(c);
  for (const f of ["a.ts", "b.ts", "a.ts", "b.ts"]) edit(c, path.join(c.repo, "src", f), { mode: "fail" });
  assert.equal(codeCalls(c, "impact").length, 2);
});

test("Edit: slow impact is cut off (~4s) and fails open", () => {
  const c = fresh("edit-slow");
  startSession(c);
  const r = edit(c, path.join(c.repo, "src", "a.ts"), { mode: "slow" });
  assert.equal(r.out, null);
  assert.ok(r.ms < 7000, `took ${r.ms}ms`);
});

test("Edit: mnotes missing → no output, fast", () => {
  const c = fresh("edit-missing");
  const r = edit(c, path.join(c.repo, "src", "a.ts"), { path: [EMPTY_DIR] });
  assert.equal(r.out, null);
  assert.ok(r.ms < 3000, `took ${r.ms}ms`);
});

test("Edit: the plugin's own npx-backed bin/ wrapper is never used for code calls", () => {
  const c = fresh("edit-wrapper");
  const r = edit(c, path.join(c.repo, "src", "a.ts"), { path: [path.join(ROOT, "bin")] });
  assert.equal(r.out, null);
  assert.ok(r.ms < 3000, `took ${r.ms}ms`);
});

// ── PreToolUse: Grep/Glob ────────────────────────────────────────────────────

test("Grep: one-line reminder the first time per session only", () => {
  const c = fresh("grep");
  startSession(c);
  const r = grep(c);
  assert.match(r.ctx, /mnotes code search/);
  assert.equal(r.hso.permissionDecision, undefined);
  assert.equal(grep(c).out, null);
  const g = run(PRE, c, { tool_name: "Glob", tool_input: { pattern: "**/*.ts" } });
  assert.equal(g.out, null);
});

test("Grep: no reminder when there is no build", () => {
  const c = fresh("grep-nobuild");
  startSession(c, { mode: "nobuild" });
  assert.equal(grep(c).out, null);
});

test("Strict mode: Grep denied until a `mnotes code` Bash command ran", () => {
  const c = fresh("strict");
  startSession(c);
  const env = { MNOTES_CODE_GRAPH: "strict" };
  const d = grep(c, { env });
  assert.equal(d.hso.permissionDecision, "deny");
  assert.match(d.hso.permissionDecisionReason, /mnotes code search/);
  bash(c, "cd src && mnotes code search Foo --json", { env });
  const ok = grep(c, { env });
  assert.notEqual(ok.hso?.permissionDecision, "deny");
});

test("Strict mode: never denies when the repo has no build", () => {
  const c = fresh("strict-nobuild");
  startSession(c, { mode: "nobuild" });
  assert.equal(grep(c, { env: { MNOTES_CODE_GRAPH: "strict" } }).out, null);
});

// ── PostToolUse Bash ─────────────────────────────────────────────────────────

test("git commit → detached refresh --if-stale when a build exists", () => {
  const c = fresh("commit");
  startSession(c);
  bash(c, "git add -A && git commit -m 'x'");
  assert.ok(waitFor(() => codeCalls(c, "refresh").length === 1), "refresh spawned");
});

test("git commit with MNOTES_CODE_AUTO_REFRESH=0 → no refresh", () => {
  const c = fresh("commit-off");
  startSession(c);
  bash(c, "git commit -m x", { env: { MNOTES_CODE_AUTO_REFRESH: "0" } });
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 1000));
});

test("git commit without a build → no refresh", () => {
  const c = fresh("commit-nobuild");
  startSession(c, { mode: "nobuild" });
  bash(c, "git commit -m x", { mode: "nobuild" });
  assert.ok(!waitFor(() => codeCalls(c, "refresh").length > 0, 1000));
});

test("`mnotes code search` is not logged to the wiki log", () => {
  const c = fresh("nolog");
  bash(c, "mnotes code search Foo", { env: { MNOTES_HOOK_DEBUG: "1" } });
  const dbg = path.join(c.home, ".claude", "plugins", "mnotes", "state", "postusetool.debug.log");
  assert.ok(!fs.existsSync(dbg) || !fs.readFileSync(dbg, "utf8").includes("mnotes code"));
  assert.ok(!waitFor(() => calls(c).some((x) => x.args[0] === "wiki"), 800));
});
