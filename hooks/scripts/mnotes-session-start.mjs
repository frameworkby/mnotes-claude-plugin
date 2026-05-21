#!/usr/bin/env node
// SessionStart hook: loads project context on Claude Code session start and emits
// it as additionalContext via the SessionStart hook JSON envelope so Claude Code
// injects it into the session.
// Workspace is resolved at runtime: MNOTES_WORKSPACE_ID env → per-cwd config map → global default.
//
// Always exits 0 — never blocks Claude Code from starting.

import { spawnSync } from "node:child_process";

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

try {
  if (!process.env.MNOTES_WORKSPACE_ID) {
    process.stderr.write(
      "mnotes-session-start: MNOTES_WORKSPACE_ID not set — workspace will be resolved from config\n",
    );
  }

  const limit = parseInt(process.env.MNOTES_SESSION_START_LIMIT || "10", 10) || 10;
  const excerptMax =
    parseInt(process.env.MNOTES_SESSION_START_EXCERPT || "240", 10) || 240;

  // Spawn the npm-bin shim directly with shell:false. Although the args here
  // are static today, future changes could pass user-influenced strings; making
  // shell:false the invariant prevents cmd.exe injection on Windows.
  const executable = process.platform === "win32" ? "mnotes.cmd" : "mnotes";
  const result = spawnSync(
    executable,
    ["composite", "project-load", "--query", "session start"],
    {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      shell: false,
    },
  );

  if (!result || result.status !== 0 || !result.stdout) {
    process.exit(0);
  }

  const raw = result.stdout.trim();
  if (!raw) process.exit(0);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const digest = buildDigest(parsed, limit, excerptMax);
  if (digest) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: digest,
        },
      }),
    );
  }
} catch {
  // never block session start
}
process.exit(0);
