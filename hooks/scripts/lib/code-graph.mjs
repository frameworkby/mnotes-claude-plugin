// Shared helpers for the code-graph hooks (`mnotes code …`).
//
// Design rules every caller relies on:
//   - Fail open. Nothing here throws; failures come back as null/false.
//   - Cheap when `mnotes` is missing. The binary is resolved by walking PATH in
//     JS (no `which` spawn). The plugin's own bin/ wrapper is skipped, because it
//     falls back to `npx -y`, which can take many seconds.
//   - shell:false always. On Windows, npm installs `mnotes.cmd`, and current Node
//     refuses to spawn .cmd/.bat files without a shell (EINVAL, CVE-2024-27980).
//     We read the shim, find the JS entry point it launches and run that with
//     `node` directly, so no cmd.exe is ever involved.
//   - Short timeouts on every call that may hit the network.
//   - Per-session state lives in the OS temp dir, keyed by the hook payload's
//     session_id.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PLUGIN_BIN = path.join(PLUGIN_ROOT, "bin");

export const DEFAULT_TIMEOUT_MS = 4000;

function realpathSafe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function pathDirs() {
  const raw = process.env.PATH || process.env.Path || "";
  return raw.split(path.delimiter).filter(Boolean);
}

function insidePluginBin(p) {
  const real = realpathSafe(p) || p;
  const roots = [PLUGIN_BIN, realpathSafe(PLUGIN_BIN)].filter(Boolean);
  if (process.env.CLAUDE_PLUGIN_ROOT) roots.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, "bin"));
  return roots.some((r) => real === r || real.startsWith(r + path.sep) || path.dirname(p) === r);
}

// Find the first `name` on PATH. On Windows, try the given extensions.
export function findOnPath(name, { windowsExts = [".cmd", ".exe"], skipPluginBin = false } = {}) {
  const names = isWindows ? windowsExts.map((e) => name + e) : [name];
  for (const dir of pathDirs()) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (!isFile(p)) continue;
      if (!isWindows) {
        try {
          fs.accessSync(p, fs.constants.X_OK);
        } catch {
          continue;
        }
      }
      if (skipPluginBin && insidePluginBin(p)) continue;
      return p;
    }
  }
  return null;
}

// Turn an npm-style `.cmd` shim into `node <entry.js>` so it can run with
// shell:false. Handles npm's cmd-shim (`"%dp0%\node_modules\…\cli.js"`) and the
// plugin's own `@node "%~dp0\mnotes.mjs" %*`.
function unwrapCmdShim(cmdPath) {
  let text;
  try {
    text = fs.readFileSync(cmdPath, "utf8");
  } catch {
    return null;
  }
  const m = /"%~?dp0%?\\?([^"%]+?\.(?:mjs|cjs|js))"/i.exec(text);
  if (!m) return null;
  const script = path.join(path.dirname(cmdPath), m[1].replace(/\\/g, path.sep));
  if (!isFile(script)) return null;
  return { cmd: process.execPath, prefix: [script] };
}

let _resolved;
// Returns { cmd, prefix } or null when no real `mnotes` CLI is installed.
export function resolveMnotes() {
  if (_resolved !== undefined) return _resolved;
  _resolved = null;
  const found = findOnPath("mnotes", { windowsExts: [".cmd", ".exe"], skipPluginBin: true });
  if (!found) return _resolved;
  if (isWindows && /\.cmd$/i.test(found)) {
    // Fall back to the raw .cmd if the shim is unrecognised: the spawn may
    // fail with EINVAL, which callers swallow.
    _resolved = unwrapCmdShim(found) || { cmd: found, prefix: [] };
  } else {
    _resolved = { cmd: found, prefix: [] };
  }
  return _resolved;
}

// Like resolveMnotes(), but the plugin's own npx-backed wrapper is acceptable.
// Used for calls that worked through the wrapper before (project-load, wiki
// log) so users without a global install keep that behaviour. Falls back to
// the bare name, which is what those hooks spawned historically.
export function resolveMnotesAny() {
  const found = findOnPath("mnotes", { windowsExts: [".cmd", ".exe"] });
  if (found && isWindows && /\.cmd$/i.test(found)) {
    return unwrapCmdShim(found) || { cmd: found, prefix: [] };
  }
  if (found) return { cmd: found, prefix: [] };
  return { cmd: isWindows ? "mnotes.cmd" : "mnotes", prefix: [] };
}

export function hasGraphify() {
  return findOnPath("graphify", { windowsExts: [".exe", ".cmd"] }) !== null;
}

// Run `mnotes <args>` and parse its stdout as JSON. Resolves to null on any
// failure: CLI missing, non-zero exit, timeout, bad JSON.
export function runMnotesJson(args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const bin = resolveMnotes();
    if (!bin) return resolve(null);
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
      try {
        child && child.kill();
      } catch {}
      finish(null);
    }, timeoutMs);
    try {
      child = spawn(bin.cmd, [...bin.prefix, ...args], {
        cwd,
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

// Fire-and-forget `mnotes <args>`, detached so it outlives the hook.
export function spawnMnotesDetached(args, { cwd } = {}) {
  const bin = resolveMnotes();
  if (!bin) return false;
  try {
    const child = spawn(bin.cmd, [...bin.prefix, ...args], {
      cwd,
      stdio: "ignore",
      shell: false,
      detached: true,
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ── Repo / file helpers ──────────────────────────────────────────────────────

// Walk up from `start` to the first directory containing `.git` (dir or file,
// so worktrees and submodules count). No git spawn.
export function findRepoRoot(start) {
  if (!start) return null;
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const CODE_EXTS = new Set(
  (
    ".ts .tsx .mts .cts .js .jsx .mjs .cjs .vue .svelte .astro .py .pyi .go .rs .java .kt .kts .scala " +
    ".groovy .rb .php .cs .fs .vb .c .h .cc .cpp .cxx .hpp .hh .hxx .m .mm .swift .dart .lua .ex .exs " +
    ".erl .hrl .hs .ml .mli .clj .cljs .elm .zig .nim .jl .r .sh .bash .zsh .ps1 .sol .proto"
  ).split(" "),
);

export function isCodeFile(p) {
  return CODE_EXTS.has(path.extname(p).toLowerCase());
}

// Repo-relative POSIX path, or null when `file` is outside `root`.
// Both sides are realpath'd so /var vs /private/var (macOS) or a symlinked
// checkout don't push a file "outside" its repo.
export function repoRelative(root, file) {
  const rel = path.relative(realpathSafe(root) || root, realpathSafe(file) || file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

// ── Per-session cache (OS temp dir, keyed by session_id) ─────────────────────

function sessionDir(sessionId) {
  const sid = String(sessionId || "nosession").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  const dir = path.join(os.tmpdir(), "mnotes-code-hooks", sid);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

function keyFile(sessionId, key) {
  const h = crypto.createHash("sha1").update(String(key)).digest("hex").slice(0, 24);
  return path.join(sessionDir(sessionId), h);
}

export function cacheGet(sessionId, key) {
  try {
    return JSON.parse(fs.readFileSync(keyFile(sessionId, key), "utf8"));
  } catch {
    return undefined;
  }
}

export function cacheSet(sessionId, key, value) {
  const f = keyFile(sessionId, key);
  const tmp = `${f}.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, f);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

// True exactly once per (session, key), even across concurrent hook runs.
export function firstTime(sessionId, key) {
  try {
    fs.closeSync(fs.openSync(keyFile(sessionId, `once:${key}`), "wx"));
    return true;
  } catch {
    return false;
  }
}

export function hasMarker(sessionId, key) {
  return fs.existsSync(keyFile(sessionId, `once:${key}`));
}

// Cross-session throttle for background refreshes of one repo: true if no
// refresh was started for `root` in the last `ttlMs` (avoids stacking runs when
// SessionStart and a quick commit both fire).
export function claimRefresh(root, ttlMs = 90 * 1000) {
  const dir = path.join(os.tmpdir(), "mnotes-code-hooks");
  const h = crypto.createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 24);
  const f = path.join(dir, `refresh-${h}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs < ttlMs) return false;
  } catch {}
  try {
    fs.writeFileSync(f, String(Date.now()));
  } catch {}
  return true;
}

export function autoRefreshEnabled() {
  return process.env.MNOTES_CODE_AUTO_REFRESH !== "0";
}

// Start `mnotes code refresh --if-stale` in the background when allowed.
export function maybeBackgroundRefresh(root) {
  if (!root || !autoRefreshEnabled() || !hasGraphify() || !resolveMnotes()) return false;
  if (!claimRefresh(root)) return false;
  return spawnMnotesDetached(["code", "refresh", "--if-stale"], { cwd: root });
}

export function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

// Status cache key and values written by SessionStart, read by the other hooks.
export const STATUS_KEY = "status";
// { state: "build" | "nobuild" | "unavailable", repoRoot }
