---
name: wiki
description: Maintain the m-notes wiki — lint link density, refresh the index, append to the log. Use when the user says /wiki or asks to lint/audit the wiki, refresh the index, check link density, or append an event to wiki/log.
---

# Maintain the m-notes Wiki

The workspace wiki lives in two canonical notes — `wiki/index` and `wiki/log` — plus link-dense topic notes. Use `mnotes wiki <action>` via Bash to keep them healthy.

## Lint — audit link density and wiki health

```bash
mnotes wiki lint [--fix] [--scope <folder-or-tag>]
```

Reports orphan notes, under-linked notes, broken wikilinks, and stale entries. `--fix` will apply safe automatic fixes (e.g. update redirects); review the diff before committing to the workspace.

## Refresh the index

```bash
mnotes wiki index-refresh
```

Regenerates `wiki/index` from current workspace contents (folders, top-tagged notes, recent activity).

## Append an event to wiki/log

```bash
mnotes wiki log-append --entry "<one-line markdown event>"
```

Use this for ingests, queries, lints, or other ops you want auditable.

## Tail the wiki log

```bash
mnotes wiki log-tail [--limit <n>]
```

## Tips
- Run `mnotes wiki lint` after large ingests to catch new orphans.
- `wiki/index` and `wiki/log` are created by `/mnotes:setup`; if they're missing in a workspace, run setup first.
- For per-folder topical indexes, use `/mnotes:moc` rather than the wiki index.
