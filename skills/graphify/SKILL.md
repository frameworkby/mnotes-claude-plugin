---
name: graphify
description: Build a code knowledge graph of the current repo with graphify and import it into m-notes. Use when the user says /graphify or asks to graph/map/visualize this codebase, import the repo structure into m-notes, or refresh the code graph after changes.
---

# Import a code graph into m-notes

graphify (Apache-2.0, PyPI `graphifyy`) extracts files, symbols, imports and calls with tree-sitter. m-notes stores the result as a graph build.

## 1. Make sure graphify is installed

```bash
graphify --version || uv tool install graphifyy==0.9.97
```

If `uv` is missing, use `pipx install graphifyy==0.9.97`. The binary is `graphify`, which may live at `~/.local/share/uv/tools/graphifyy/bin/graphify` when it is not on PATH. The m-notes importer is tested against 0.9.97. Tell the user if their version differs.

## 2. Extract (code only: deterministic, no LLM, no API key)

Run from the repo root. Node ids are relative to the scan root. Write the output to a temp dir so the repo stays clean:

```bash
OUT="$(mktemp -d)"
graphify extract . --code-only --out "$OUT"
```

This writes `$OUT/graphify-out/graph.json` and takes a few seconds per few hundred files. Use `--exclude <glob>` to skip vendored or generated code.

Only if the user explicitly asks to include docs, papers or images: drop `--code-only` and add `--backend claude-cli`. That uses the local `claude` binary, so it is slower and costs tokens. Other backends need their API key.

## 3. Import

```bash
mnotes graph import "$OUT/graphify-out/graph.json" --name "$(basename "$PWD")" --root "$PWD" --commit "$(git rev-parse --short HEAD 2>/dev/null)" --replace
```

- `--replace` overwrites the previous build with the same name. Leave it out to keep old builds; the import then fails if the name already exists.
- If the import reports the file is over 30 MB, re-run step 2 with `--exclude` for tests, fixtures or generated code.

## 4. Report

Tell the user the node, edge and community counts and the build URL that the import printed (`/graph/builds/<id>`). The interactive viewer page ships in a later m-notes release, so the URL may not render yet.

## Use the graph

After the import, query the build with `mnotes code` (`/mnotes:code`):

```bash
mnotes code status
mnotes code search <name>
mnotes code show <name>
mnotes code impact <file>
```

`mnotes code refresh` repeats steps 2 and 3 in one command, with the same build name, `--root`, `--commit` and `--replace`. `--if-stale` skips the work when the build is current. The plugin hooks run `mnotes code refresh --if-stale` in the background at session start and after `git commit` (turn this off with `MNOTES_CODE_AUTO_REFRESH=0`).

## Manage builds

```bash
mnotes graph builds
mnotes graph delete-build <id>
```
