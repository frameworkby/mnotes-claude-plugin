---
name: wiki
description: Maintain the m-notes wiki — lint link density, refresh the index, append to the log. Use when the user says /wiki or asks to lint/audit the wiki, refresh the index, check link density, or append an event to wiki/log.
---

# Maintain the m-notes Wiki

The workspace wiki lives in two canonical notes — `wiki/index` and `wiki/log` — plus link-dense topic notes. Use `mnotes wiki <action>` via Bash to keep them healthy.

## Lint — audit link density and wiki health

```bash
mnotes wiki lint [--checks <csv>] [--limit <n>] [--include-archived] [--include-system] [--notes-only]
```

Reports orphan notes, under-linked notes, broken wikilinks, and stale entries.

- **--checks**: Comma-separated subset of checks to run (omit to run all).
- **--limit**: Cap the number of findings per check.
- **--include-archived**: Include archived notes (default: excluded).
- **--include-system**: Include system notes like `Wiki Index` / `Wiki Activity Log` (default: excluded).
- **--notes-only**: Skip non-note nodes.

## Refresh the index

```bash
mnotes wiki index refresh
```

Regenerates `wiki/index` from current workspace contents. Prints `added=N removed=N unchanged=N total=N`.

## Append an event to wiki/log

```bash
mnotes wiki log append --kind <ingest|query|lint|decision> --ref "<short ref>" [--summary "<one-line summary>"]
```

- **--kind** (required): One of `ingest`, `query`, `lint`, `decision`.
- **--ref** (required): Short reference — e.g. a note title, key, or command label.
- **--summary**: Optional one-line description.

In most cases you do not need to call this manually — the plugin's `PostToolUse` hook auto-appends an entry for relevant mnotes CLI calls. Use the manual form for explicit `decision` entries.

## Tail the wiki log

```bash
mnotes wiki log tail [--limit <n>]
```

Defaults to the last 20 entries, most recent first.

## Tips
- Run `mnotes wiki lint` after large ingests to catch new orphans.
- `wiki/index` and `wiki/log` are created by `/mnotes:setup`; if they're missing in a workspace, run setup first.
- For per-folder topical indexes, use `/mnotes:moc` rather than the wiki index.
