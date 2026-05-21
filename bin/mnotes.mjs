#!/usr/bin/env node
// Cross-platform launcher for the mnotes CLI.
// Strategy:
//   1. If a globally-installed `mnotes` exists on PATH (and isn't this wrapper),
//      exec it with the forwarded args.
//   2. Otherwise, fall back to `npx -y mnotes@^1`.
// A sentinel env var prevents the global-probe from recursing into this script
// when the wrapper itself happens to be the first `mnotes` on PATH.

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const args = process.argv.slice(2);

function tryGlobalInstall() {
  if (process.env.MNOTES_BIN_WRAPPER === "1") {
    // We're already inside a wrapper invocation; don't probe again.
    return false;
  }
  const probe = spawnSync("mnotes", ["--version"], {
    stdio: "ignore",
    shell: isWindows,
    env: { ...process.env, MNOTES_BIN_WRAPPER: "1" },
  });
  return probe.status === 0;
}

function run(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, {
    stdio: "inherit",
    shell: isWindows,
    env: { ...process.env, MNOTES_BIN_WRAPPER: "1" },
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
  child.on("error", (err) => {
    console.error(`mnotes wrapper: failed to spawn ${cmd}: ${err.message}`);
    process.exit(1);
  });
}

if (tryGlobalInstall()) {
  run("mnotes", args);
} else {
  run("npx", ["-y", "mnotes@^1", ...args]);
}
