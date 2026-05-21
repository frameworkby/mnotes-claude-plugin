#!/usr/bin/env node
// PostToolUse hook: auto-appends a wiki/log entry for tool calls made through
// Claude Code, across multiple tool families.
//
// Reads Claude Code's PostToolUse JSON envelope from stdin.
// Always exits 0 — never blocks Claude Code.
// State dir: ~/.claude/plugins/mnotes/state (stable per-user path).
//
// See the original mnotes-post-tool-use.sh for the tool-family → log mapping table.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_DIR = path.join(os.homedir(), ".claude", "plugins", "mnotes", "state");

const DEFAULT_DECISION_PATHS =
  "(^|/)CLAUDE\\.md$|(^|/)\\.claude/settings(\\.local)?\\.json$|(^|/)presets/[^/]+/CLAUDE\\.md$";

// \s covers POSIX [[:space:]] for our inputs; env overrides are translated below.
const DEFAULT_BASH_DECISION_ALLOW =
  "^git\\s+checkout\\s+-b\\s+|^git\\s+commit(\\s|$)|^gh\\s+pr\\s+create(\\s|$)|^gh\\s+pr\\s+merge(\\s|$)|^gh\\s+release\\s+create(\\s|$)|^(npm|pnpm|yarn)\\s+publish(\\s|$)";

// Compile env-supplied regex extensions once at startup so a malformed user
// pattern produces a single stderr warning instead of silently disabling the
// classifier inside the per-event try/catch.
const DECISION_PATHS_REGEX = (() => {
  let pattern = DEFAULT_DECISION_PATHS;
  const extra = process.env.MNOTES_HOOK_DECISION_PATHS;
  if (extra) {
    const candidate = pattern + "|" + extra.split(",").join("|");
    try {
      const re = new RegExp(candidate);
      return re;
    } catch {
      process.stderr.write(
        "mnotes-hook: invalid MNOTES_HOOK_DECISION_PATHS regex, ignoring extension\n",
      );
    }
  }
  return new RegExp(pattern);
})();

const BASH_DECISION_REGEX = (() => {
  let pattern = DEFAULT_BASH_DECISION_ALLOW;
  const extra = process.env.MNOTES_HOOK_DECISION_ALLOW;
  if (extra) {
    const translated = extra
      .split(",")
      .map((s) => s.replace(/\[\[:space:\]\]/g, "\\s"))
      .join("|");
    const candidate = pattern + "|" + translated;
    try {
      const re = new RegExp(candidate);
      return re;
    } catch {
      process.stderr.write(
        "mnotes-hook: invalid MNOTES_HOOK_DECISION_ALLOW regex, ignoring extension\n",
      );
    }
  }
  return new RegExp(pattern);
})();

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function extractFlag(command, flag) {
  // Escape regex metacharacters in `flag` to allow safe interpolation.
  const f = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Try single-quoted, double-quoted, then bare value.
  const sq = new RegExp(`${f}\\s+'([^']+)'`).exec(command);
  if (sq) return sq[1];
  const dq = new RegExp(`${f}\\s+"([^"]+)"`).exec(command);
  if (dq) return dq[1];
  const bare = new RegExp(`${f}\\s+(\\S+)`).exec(command);
  if (bare) return bare[1];
  return "";
}

function classify(payload) {
  const toolName = payload.tool_name || "";
  const command = (payload.tool_input && payload.tool_input.command) || "";
  const filePath = (payload.tool_input && payload.tool_input.file_path) || "";

  if (toolName === "Read") {
    if (!filePath) return null;
    return { kind: "ingest", ref: filePath };
  }

  if (toolName === "Edit" || toolName === "Write") {
    if (!filePath) return null;
    const isDecision = DECISION_PATHS_REGEX.test(filePath);
    return { kind: isDecision ? "decision" : "ingest", ref: filePath };
  }

  if (toolName === "Bash") {
    const cmdTrim = (command || "").replace(/^\s+/, "");

    if (/^mnotes\s/.test(cmdTrim)) {
      // ── Legacy mnotes classifier ───────────────────────────────────────────
      if (/(note\s+create|note\s+update|note-ops\s+append)/.test(command)) {
        let ref = extractFlag(command, "--title");
        if (!ref) {
          const stdout = (payload.tool_response && payload.tool_response.stdout) || "";
          ref = stdout.replace(/\n/g, "").slice(0, 60);
        }
        if (!ref) ref = "untitled";
        return { kind: "ingest", ref };
      }
      if (/\bsearch\b|recall-knowledge|kb\s+recall|bulk\s+knowledge-recall/.test(command)) {
        let ref = extractFlag(command, "--query");
        if (!ref) {
          const m = /(search|recall-knowledge|kb\s+recall|bulk\s+knowledge-recall)\s+(\S+)/.exec(command);
          if (m) {
            const last = m[2];
            if (!/^(\||&|;|<|>|[12]?>|>>|&&|\|\|)/.test(last)) {
              ref = last.replace(/[;&]$/, "");
            }
          }
        }
        if (!ref) ref = "query";
        return { kind: "query", ref };
      }
      if (/(wiki\s+lint|kb\s+scan-conflicts)/.test(command)) {
        let ref = "";
        const m = /(wiki\s+lint|kb\s+scan-conflicts)\s+(\S+)/.exec(command);
        if (m) {
          const last = m[2];
          if (!/^(\||&|;|<|>|[12]?>|>>|&&|\|\|)/.test(last)) {
            ref = last.replace(/[;&]$/, "");
          }
        }
        if (!ref) ref = "all";
        return { kind: "lint", ref };
      }
      return null;
    }

    // ── Non-mnotes Bash: decision allowlist ──────────────────────────────────
    if (!BASH_DECISION_REGEX.test(cmdTrim)) {
      return null;
    }
    let ref;
    if (/^git\s+checkout\s+-b\s+/.test(cmdTrim)) {
      const parts = cmdTrim.split(/\s+/);
      ref = parts[3] || "git checkout -b";
    } else if (/^git\s+commit/.test(cmdTrim)) {
      ref = "git commit";
    } else if (/^gh\s+pr\s+create/.test(cmdTrim)) {
      ref = "gh pr create";
    } else if (/^gh\s+pr\s+merge/.test(cmdTrim)) {
      ref = "gh pr merge";
    } else if (/^gh\s+release\s+create/.test(cmdTrim)) {
      ref = "gh release create";
    } else if (/^(npm|pnpm|yarn)\s+publish/.test(cmdTrim)) {
      const parts = cmdTrim.split(/\s+/);
      ref = `${parts[0]} ${parts[1]}`;
    } else {
      const parts = cmdTrim.split(/\s+/);
      ref = `${parts[0]} ${parts[1] || ""}`.trim();
    }
    return { kind: "decision", ref };
  }

  return null;
}

function dedupCheck(kind, ref) {
  const dedupFile = path.join(STATE_DIR, "postusetool.dedup");
  const hash = crypto.createHash("sha256").update(`${kind}|${ref}`).digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - 300;

  let lines = [];
  try {
    if (fs.existsSync(dedupFile)) {
      lines = fs.readFileSync(dedupFile, "utf8").split("\n").filter(Boolean);
    }
  } catch {
    lines = [];
  }

  // Prune older than cutoff.
  lines = lines.filter((line) => {
    const ts = parseInt(line.split(/\s+/)[0], 10);
    return Number.isFinite(ts) && ts > cutoff;
  });

  // Dedup: same hash already present?
  const isDuplicate = lines.some((line) => line.endsWith(` ${hash}`));
  if (!isDuplicate) {
    lines.push(`${now} ${hash}`);
  }
  // Cap to last 200.
  if (lines.length > 200) lines = lines.slice(-200);

  // Atomic write: two parallel hook invocations could otherwise clobber the
  // dedup file mid-read-modify-write. Write to a unique tmp file, then rename
  // over the target (rename is atomic on POSIX and Windows NTFS).
  const tmp = `${dedupFile}.tmp.${process.pid}.${crypto.randomBytes(6).toString("hex")}`;
  try {
    fs.writeFileSync(tmp, lines.join("\n") + (lines.length ? "\n" : ""));
    fs.renameSync(tmp, dedupFile);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
  return isDuplicate;
}

function sessionCap(sessionId) {
  const sid = sessionId || `pid${process.pid}`;
  const sessionFile = path.join(STATE_DIR, `postusetool.session.${sid}`);
  let count = 0;
  try {
    if (fs.existsSync(sessionFile)) {
      const raw = fs.readFileSync(sessionFile, "utf8").trim();
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) count = n;
    }
  } catch {}

  if (count >= 30) {
    process.stderr.write("mnotes auto-log: session cap reached\n");
    return false;
  }
  try {
    fs.writeFileSync(sessionFile, `${count + 1}\n`);
  } catch {}
  return true;
}

function buildSummary(stdout, toolName, ref) {
  // First non-blank line, truncated to 80 chars on word boundary.
  let line = "";
  if (typeof stdout === "string" && stdout) {
    const found = stdout.split("\n").find((l) => l.trim().length > 0);
    if (found) line = found;
  }
  let summary = "";
  if (line) {
    if (line.length <= 80) {
      summary = line;
    } else {
      const words = line.split(" ");
      let r = "";
      for (const w of words) {
        const t = r === "" ? w : `${r} ${w}`;
        if (t.length > 80) break;
        r = t;
      }
      summary = r;
    }
  }

  if (!summary) {
    switch (toolName) {
      case "Read":
        summary = `Read ${ref}`;
        break;
      case "Edit":
        summary = `Edited ${ref}`;
        break;
      case "Write":
        summary = `Wrote ${ref}`;
        break;
      case "Bash":
        summary = `${ref}`;
        break;
      default:
        summary = `${ref}`;
    }
  }
  return summary;
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw) process.exit(0);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      process.exit(0);
    }

    const cls = classify(payload);
    if (!cls) process.exit(0);

    const { kind, ref } = cls;

    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    } catch {}

    if (dedupCheck(kind, ref)) process.exit(0);
    if (!sessionCap(payload.session_id)) process.exit(0);

    const stdout = (payload.tool_response && payload.tool_response.stdout) || "";
    const summary = buildSummary(stdout, payload.tool_name, ref);

    // Fire-and-forget — don't await.
    // Never use `shell: true`: `ref` and `summary` are user-influenced and would
    // otherwise be interpreted by cmd.exe on Windows. Spawn the npm-bin shim
    // directly (`mnotes.cmd` on Windows, `mnotes` elsewhere) with shell:false so
    // args are passed verbatim — no shell metacharacter interpretation.
    try {
      const executable = process.platform === "win32" ? "mnotes.cmd" : "mnotes";
      const child = spawn(
        executable,
        ["wiki", "log", "append", "--kind", kind, "--ref", ref, "--summary", summary],
        { stdio: "ignore", shell: false, detached: false },
      );
      child.on("error", () => {});
      child.unref();
    } catch {}

    if (process.env.MNOTES_HOOK_DEBUG === "1") {
      try {
        const ts = new Date().toISOString().slice(0, 19) + "Z";
        const debugLine = `${ts} tool=${payload.tool_name} kind=${kind} ref=${ref} summary=${summary}\n`;
        fs.appendFileSync(path.join(STATE_DIR, "postusetool.debug.log"), debugLine);
      } catch {}
    }
  } catch {
    // never block tool flow
  }
  process.exit(0);
})();
