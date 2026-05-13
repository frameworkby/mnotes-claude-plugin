---
name: snapshot
description: Export the m-notes knowledge base or inspect its stats/conflicts. Use when the user says /snapshot or asks to export all knowledge, get KB stats, scan for conflicts, or audit knowledge health.
---

# Snapshot & Audit the m-notes Knowledge Base

Run `mnotes kb <action>` via Bash for whole-KB read-only operations.

## Export every knowledge entry

```bash
mnotes kb snapshot [--tags "<csv>"] [--out <path>]
```

Outputs every entry (or every entry matching the tag filter) as JSON. Use this for backups, off-line analysis, or migrating between workspaces.

## Stats — counts, tag distribution, freshness

```bash
mnotes kb stats
```

## Scan for conflicting / duplicate knowledge

```bash
mnotes kb scan-conflicts
```

Re-runs the conflict detector across the KB. Results land in:

```bash
mnotes kb conflicts [--status open|resolved] [--limit <n>]
```

## Consolidate near-duplicates

```bash
mnotes kb consolidate --keys "<key1>,<key2>"
```

Merges entries — review the output before accepting; the operation is durable.

## Decay — surface stale entries

```bash
mnotes kb decay [--threshold-days <n>]
```

## Archive stale knowledge

```bash
mnotes kb archive --key "<category/name>"
```

## Tips
- Run `mnotes kb stats` before/after large ingests to verify growth and tag balance.
- `snapshot` is read-only and safe to run anytime; `consolidate`/`archive` are destructive — confirm with the user first.
- For non-knowledge note exports, see `mnotes note list --json` paginated.
