#!/usr/bin/env node
// Test stub for `mnotes` (and `graphify`, which only needs to exist on PATH).
// Logs { args, cwd } to $MNOTES_STUB_LOG and answers with the JSON shapes from
// the code-graph contract. $MNOTES_STUB_MODE: build (default) | stale |
// dirty | nobuild | noimpact | notingraph | fail | slow.
import fs from "node:fs";

const args = process.argv.slice(2);
// Shapes follow mnotes-cli 4.6.0 (frameworkby/mnotes-cli#18).
const mode = process.env.MNOTES_STUB_MODE || "build";
if (process.env.MNOTES_STUB_LOG) {
  fs.appendFileSync(process.env.MNOTES_STUB_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\n");
}
const out = (v) => process.stdout.write(JSON.stringify(v));

if (args[0] === "composite") {
  out({ data: { knowledge: [{ title: "Stub knowledge", excerpt: "from stub" }] } });
  process.exit(0);
}

if (args[0] !== "code") process.exit(0);

if (mode === "fail") {
  process.stderr.write("error: unknown command 'code'\n");
  process.exit(1);
}
if (mode === "slow" && args[1] !== "refresh") {
  setTimeout(() => process.exit(0), 15000);
} else {
  const build = { id: "b1", name: "repo", commitSha: "abc1234def5678", createdAt: "2026-11-01T00:00:00Z", stats: { nodes: 10, edges: 20 } };
  switch (args[1]) {
    case "status":
      if (mode === "nobuild") out({ build: null, repoRoot: process.cwd(), head: "fff0000", behind: null, stale: false, dirty: false });
      else if (mode === "stale") out({ build, repoRoot: process.cwd(), head: "fff0000", behind: 3, stale: true, dirty: false });
      else if (mode === "dirty") out({ build, repoRoot: process.cwd(), head: "abc1234", behind: 0, stale: false, dirty: true });
      else out({ build, repoRoot: process.cwd(), head: "abc1234", behind: 0, stale: false, dirty: false });
      break;
    case "impact": {
      const target = args[2];
      if (mode === "notingraph") {
        // CLI maps the API's 404 (file not in the build) to this, exit 0.
        out({ target: { file: target }, dependents: [], files: [], truncated: false, build, matchedBy: "file", query: target, notInGraph: true });
        break;
      }
      const files =
        mode === "noimpact"
          ? []
          : [
              { sourceFile: target, minDistance: 0, count: 1 },
              ...Array.from({ length: 20 }, (_, i) => ({
                sourceFile: `src/dep${String(i + 1).padStart(2, "0")}.ts`,
                minDistance: 1,
                count: i === 0 ? 2 : 1,
              })),
            ];
      out({ target: { file: target }, dependents: [], files, truncated: false, build, matchedBy: "file", query: target });
      break;
    }
    case "refresh":
      out({ refreshed: false, reason: "up-to-date" });
      break;
    default:
      out({});
  }
}
