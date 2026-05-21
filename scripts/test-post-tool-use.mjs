#!/usr/bin/env node
// Smoke test: hooks/scripts/mnotes-post-tool-use.mjs tool-family classifier.
//
// Verifies that every documented tool family (Bash mnotes, Bash decision
// allowlist, Read/Edit/Write) routes to the right kind/ref pair and that
// unrelated tool calls skip logging.
//
// Cross-platform port of scripts/test-post-tool-use.sh. Uses Node's built-in
// node:test runner (no new deps) and the hook's existing MNOTES_HOOK_DEBUG=1
// log file as the assertion surface — no PATH shim required.
//
// Usage: node scripts/test-post-tool-use.mjs
// Exit code: 0 on pass, 1 on fail.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOOK = path.resolve(__dirname, "..", "hooks", "scripts", "mnotes-post-tool-use.mjs");

if (!fs.existsSync(HOOK)) {
  console.error(`FAIL: hook not found at ${HOOK}`);
  process.exit(1);
}

// Fresh per-process temp HOME — isolates dedup/session state across the test run.
const STATE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mnotes-hook-test-"));
const DEBUG_LOG = path.join(
  STATE_HOME,
  ".claude",
  "plugins",
  "mnotes",
  "state",
  "postusetool.debug.log",
);

process.on("exit", () => {
  try {
    fs.rmSync(STATE_HOME, { recursive: true, force: true });
  } catch {}
});

let _rand = 0;
function sid() {
  _rand += 1;
  return `sid-${Date.now()}-${_rand}-${Math.floor(Math.random() * 1e9)}`;
}

function envelope(toolName, toolInput, sessionId = sid(), toolResponse = { stdout: "" }) {
  return JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
    session_id: sessionId,
  });
}

function payloadBash(command, sessionId) {
  return envelope("Bash", { command }, sessionId, { stdout: "ok" });
}
function payloadRead(filePath, sessionId) {
  return envelope("Read", { file_path: filePath }, sessionId);
}
function payloadEdit(filePath, sessionId) {
  return envelope("Edit", { file_path: filePath }, sessionId);
}
function payloadWrite(filePath, sessionId) {
  return envelope("Write", { file_path: filePath }, sessionId);
}

function runHook(payload, extraEnv = {}) {
  const env = {
    ...process.env,
    HOME: STATE_HOME,
    USERPROFILE: STATE_HOME, // os.homedir() honors USERPROFILE on Windows
    MNOTES_HOOK_DEBUG: "1",
    // Prevent the hook's `mnotes` spawn from accidentally hitting a real CLI
    // in CI — point PATH at the temp dir (empty), spawn will error and be
    // swallowed by child.on("error"). Keep just the node bin so child_process
    // can still resolve `node` for itself if needed.
    PATH: process.env.PATH,
    ...extraEnv,
  };
  const result = spawnSync(process.execPath, [HOOK], {
    input: payload,
    encoding: "utf8",
    env,
    timeout: 10_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `hook exited with ${result.status}: stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  return result;
}

function lastDebugEntry() {
  if (!fs.existsSync(DEBUG_LOG)) return "";
  const data = fs.readFileSync(DEBUG_LOG, "utf8");
  const lines = data.split("\n").filter((l) => l.length > 0);
  return lines.length ? lines[lines.length - 1] : "";
}

function countMatches(pattern) {
  if (!fs.existsSync(DEBUG_LOG)) return 0;
  const data = fs.readFileSync(DEBUG_LOG, "utf8");
  return data.split("\n").filter((l) => l.includes(pattern)).length;
}

function assertKind(payload, expectedKind, extraEnv) {
  runHook(payload, extraEnv);
  const entry = lastDebugEntry();
  assert.ok(
    entry.includes(`kind=${expectedKind}`),
    `expected kind=${expectedKind}, got: ${entry}`,
  );
}

function assertRefContains(payload, needle, extraEnv) {
  runHook(payload, extraEnv);
  const entry = lastDebugEntry();
  assert.ok(
    entry.includes(`ref=${needle}`),
    `expected ref=${needle}, got: ${entry}`,
  );
}

function assertSkipped(payload, extraEnv) {
  const before = lastDebugEntry();
  runHook(payload, extraEnv);
  const after = lastDebugEntry();
  assert.equal(after, before, `expected no new entry, got: ${after}`);
}

// ── Legacy mnotes Bash families ────────────────────────────────────────────

test("Bash mnotes: kb recall → query", () => {
  assertKind(payloadBash("mnotes kb recall --query test"), "query");
});
test("Bash mnotes: bulk knowledge-recall → query", () => {
  assertKind(payloadBash("mnotes bulk knowledge-recall --query test"), "query");
});
test("Bash mnotes: note search → query", () => {
  assertKind(payloadBash("mnotes note search --query test"), "query");
});
test("Bash mnotes: recall-knowledge → query", () => {
  assertKind(payloadBash("mnotes recall-knowledge --query test"), "query");
});
test("Bash mnotes: note create → ingest", () => {
  assertKind(payloadBash("mnotes note create --title 'Foo'"), "ingest");
});
test("Bash mnotes: wiki lint → lint", () => {
  assertKind(payloadBash("mnotes wiki lint backlinks"), "lint");
});
test("Bash mnotes: note list is skipped", () => {
  assertSkipped(payloadBash("mnotes note list"));
});
test("Bash: non-mnotes random command is silent", () => {
  assertSkipped(payloadBash("ls -la"));
});

// ── Read tool ──────────────────────────────────────────────────────────────

test("Read: /tmp/foo.txt → ingest", () => {
  assertKind(payloadRead("/tmp/foo.txt"), "ingest");
});
test("Read: ref carries file_path", () => {
  assertRefContains(payloadRead("/tmp/uniq-read-ref.txt"), "/tmp/uniq-read-ref.txt");
});
test("Read: empty file_path is skipped", () => {
  assertSkipped(payloadRead(""));
});

// ── Edit/Write tool ────────────────────────────────────────────────────────

test("Edit: ordinary path → ingest", () => {
  assertKind(payloadEdit("/tmp/code/foo.ts"), "ingest");
});
test("Edit: CLAUDE.md → decision", () => {
  assertKind(payloadEdit("/repo/CLAUDE.md"), "decision");
});
test("Edit: .claude/settings.json → decision", () => {
  assertKind(payloadEdit("/repo/.claude/settings.json"), "decision");
});
test("Edit: .claude/settings.local.json → decision", () => {
  assertKind(payloadEdit("/r/.claude/settings.local.json"), "decision");
});
test("Edit: presets/<x>/CLAUDE.md → decision", () => {
  assertKind(payloadEdit("/repo/presets/webapp-nextjs/CLAUDE.md"), "decision");
});
test("Write: CLAUDE.md → decision", () => {
  assertKind(payloadWrite("/repo/CLAUDE.md"), "decision");
});
test("Write: ordinary path → ingest", () => {
  assertKind(payloadWrite("/tmp/code/bar.ts"), "ingest");
});

// ── Bash decision allowlist ────────────────────────────────────────────────

test("Bash: git checkout -b → decision", () => {
  assertKind(payloadBash("git checkout -b feat/foo"), "decision");
});
test("Bash: git checkout -b ref carries branch name", () => {
  assertRefContains(payloadBash("git checkout -b feat/x-unique"), "feat/x-unique");
});
test("Bash: git commit → decision", () => {
  assertKind(payloadBash("git commit -m 'msg'"), "decision");
});
test("Bash: gh pr create → decision", () => {
  assertKind(payloadBash("gh pr create --title foo"), "decision");
});
test("Bash: gh pr merge → decision", () => {
  assertKind(payloadBash("gh pr merge 42 --squash"), "decision");
});
test("Bash: gh release create → decision", () => {
  assertKind(payloadBash("gh release create v1.2.3"), "decision");
});
test("Bash: npm publish → decision", () => {
  assertKind(payloadBash("npm publish --access public"), "decision");
});
test("Bash: pnpm publish → decision", () => {
  assertKind(payloadBash("pnpm publish"), "decision");
});
test("Bash: yarn publish → decision", () => {
  assertKind(payloadBash("yarn publish"), "decision");
});

test("Bash: random ls is silent", () => {
  assertSkipped(payloadBash("ls -la /tmp"));
});
test("Bash: random echo is silent", () => {
  assertSkipped(payloadBash("echo hello"));
});
test("Bash: git log is silent", () => {
  assertSkipped(payloadBash("git log --oneline -5"));
});

// ── Env-var configurability ────────────────────────────────────────────────

test("env MNOTES_HOOK_DECISION_ALLOW extends Bash allowlist", () => {
  const before = lastDebugEntry();
  runHook(payloadBash("terraform apply -auto-approve"), {
    MNOTES_HOOK_DECISION_ALLOW: "^terraform\\s+apply",
  });
  const after = lastDebugEntry();
  assert.notEqual(after, before);
  assert.ok(after.includes("kind=decision"), `expected decision, got: ${after}`);
});

test("env MNOTES_HOOK_DECISION_PATHS extends Edit/Write decision list", () => {
  const before = lastDebugEntry();
  runHook(payloadEdit("/repo/Dockerfile"), {
    MNOTES_HOOK_DECISION_PATHS: "(^|/)Dockerfile$",
  });
  const after = lastDebugEntry();
  assert.notEqual(after, before);
  assert.ok(after.includes("kind=decision"), `expected decision, got: ${after}`);
});

// ── Session rate cap ───────────────────────────────────────────────────────

test("session rate cap holds across 50 Reads (≤30 logged)", () => {
  const session = `sid-ratecap-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const before = countMatches("ref=/tmp/rate-");
  for (let i = 1; i <= 50; i += 1) {
    runHook(payloadRead(`/tmp/rate-${i}.txt`, session));
  }
  const after = countMatches("ref=/tmp/rate-");
  const logged = after - before;
  assert.ok(logged >= 1 && logged <= 30, `expected 1..30, got ${logged}`);
});

// ── Unknown tool type ──────────────────────────────────────────────────────

test("Unknown tool name (Glob) is skipped", () => {
  assertSkipped(
    envelope("Glob", { pattern: "**/*.ts" }, "sid-x"),
  );
});
