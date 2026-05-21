#!/usr/bin/env node
// Cross-platform launcher for the mnotes CLI.
//
// Strategy:
//   1. If a globally-installed `mnotes` exists on PATH AND is not this very
//      wrapper (verified via realpath), exec it with the forwarded args.
//   2. Otherwise, fall back to `npx -y mnotes@^1`.
//
// Safety notes:
//   - We never spawn with `shell: true`. On Windows, `shell: true` would let
//     metacharacters in user args (e.g. `mnotes search "a & b"`) be
//     interpreted by cmd.exe. Instead we name the `.cmd` shim explicitly on
//     win32 — Node's PATHEXT-aware resolver finds it without a shell.
//   - The `where` / `which` probe never receives user input, so it is safe.
//   - The sentinel env var MNOTES_BIN_WRAPPER short-circuits re-entry: if
//     this wrapper is itself first on PATH, the realpath check below catches
//     it, and the sentinel guarantees nested invocations skip the probe.
//
// `mnotes@^1` pin: matches the documented major in the plugin manifest at
// the time of this commit. Bump in lock-step with the plugin's expected CLI
// major if the upstream CLI's API ever breaks.

import { spawn, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

const isWindows = process.platform === "win32";
const args = process.argv.slice(2);
const selfPath = fileURLToPath(import.meta.url);

// Resolve the `mnotes` binary on PATH via the OS resolver. Inputs are fixed
// strings (never user data) and shell is disabled — safe.
function whichMnotes() {
  const probeCmd = isWindows ? "where.exe" : "which";
  const result = spawnSync(probeCmd, ["mnotes"], {
    stdio: ["ignore", "pipe", "ignore"],
    shell: false,
  });
  if (result.status !== 0 || !result.stdout) return null;
  const firstLine = result.stdout.toString().split(/\r?\n/)[0].trim();
  return firstLine || null;
}

function realpathSafe(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function run(cmd, cmdArgs) {
  // On Windows, npm installs `.cmd` shims for globally-installed binaries.
  // Name them explicitly so Node resolves them without a shell. If the caller
  // already passed an absolute or extensioned path (e.g. from `where`), use
  // it as-is.
  const needsCmdSuffix = isWindows && !cmd.includes(".") && !cmd.includes("\\") && !cmd.includes("/");
  const resolvedCmd = needsCmdSuffix ? `${cmd}.cmd` : cmd;
  const child = spawn(resolvedCmd, cmdArgs, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, MNOTES_BIN_WRAPPER: "1" },
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      // Note: process.kill(pid, signal) is a no-op for SIGTERM/SIGINT on
      // Windows — Node does not implement POSIX signal semantics there.
      // On POSIX, re-raising lets the parent observe a matching exit.
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
  child.on("error", (err) => {
    console.error(`mnotes wrapper: failed to spawn ${resolvedCmd}: ${err.message}`);
    process.exit(1);
  });
}

function runNpxFallback() {
  run("npx", ["-y", "mnotes@^1", ...args]);
}

// If we are already inside a wrapper invocation, never probe — go straight
// to the npx fallback. Without this, a wrapper-first PATH would loop.
if (process.env.MNOTES_BIN_WRAPPER === "1") {
  runNpxFallback();
} else {
  const probed = whichMnotes();
  const probedReal = probed ? realpathSafe(probed) : null;
  const selfReal = realpathSafe(selfPath);
  const isSelf = probedReal && selfReal && probedReal === selfReal;
  if (probed && !isSelf) {
    run(probed, args);
  } else {
    runNpxFallback();
  }
}
