---
name: code
description: Query the m-notes code graph of the current repo — find where a symbol or file lives, who calls or imports it, and what an edit would affect. Use when the user says /code, asks "where is X defined", "who uses X", "what depends on this file", "what breaks if I change X", or before exploring or editing unfamiliar code in a repo that has a graphify build.
---

# Query the code graph

`mnotes code` reads the graphify build of this repo stored in m-notes (see `/mnotes:graphify`). It answers structural questions directly, so use it before broad Grep/Glob. Add `--json` to any command for machine-readable output.

The build is picked as follows: `--build <id|name>`, then `MNOTES_CODE_BUILD`, then the newest build named after the repo directory.

## 1. Check the build

```bash
mnotes code status
```

This shows the build name and commit, and how many commits it is behind HEAD. If there is no build, run `/mnotes:graphify` (or `mnotes code refresh`). If it is stale, results for recently changed code may be missing; `mnotes code refresh --if-stale` rebuilds it, which needs `graphify` installed.

## 2. Find things

```bash
mnotes code search <name> [--type <nodeType>] [--limit <n>]
```

Matches symbol labels and file paths. Exact names rank first, then prefixes, then substrings, then path matches.

## 3. Look at one node

```bash
mnotes code show <node-id | name>
```

This prints the location, a snippet, callers (incoming edges), callees and imports (outgoing edges) grouped by relation, and linked m-notes notes. Given a name instead of an id, it uses the top search hit and says so.

## 4. Before editing: impact

```bash
mnotes code impact <file-path | symbol> [--depth 1..4] [--limit <n>]
```

This walks reverse dependencies (calls, imports, references, inheritance and so on, but not `contains`) and lists the affected files with their distance. Run it on every file you are about to change and check the dependents it reports. A file that is not in the build yet (new, or the graph is stale) reports no dependents.

## Typical flow

1. `mnotes code status`: is there a fresh build?
2. `mnotes code search` and `mnotes code show` to locate the code in question.
3. `mnotes code impact` on each file you plan to change.
4. Read only the files that matter, then edit.

## Hooks that support this

The plugin's hooks do part of this automatically:

| When | What happens |
|---|---|
| Session start | Build status is injected. A stale build is refreshed in the background if `graphify` is installed. |
| Before Edit/Write/MultiEdit/NotebookEdit | The direct dependents of that file are injected, once per file per session. |
| First Grep/Glob in a session | A one-line reminder to use `mnotes code search`. |
| After `git commit` | A background `mnotes code refresh --if-stale`. |

Settings: `MNOTES_CODE_GRAPH=strict` blocks Grep/Glob until a `mnotes code` command has run in the session. `MNOTES_CODE_AUTO_REFRESH=0` turns off background refreshes. `MNOTES_CODE_BUILD` pins a build.
