---
name: snapshot
description: Export the m-notes knowledge base or inspect its stats/conflicts. Use when the user says /snapshot or asks to export all knowledge, get KB stats, scan for conflicts, or audit knowledge health.
---

# Snapshot & Audit the m-notes Knowledge Base

Run `mnotes kb <action>` via Bash for whole-KB read-only operations.

## Export every knowledge entry

```bash
mnotes kb snapshot [--tags "<csv>"] [--format json|markdown]
```

Outputs every entry (or every entry matching the tag filter) in the chosen format. `--format` defaults to `json`. To write to a file, redirect via shell:

```bash
mnotes kb snapshot --format markdown > kb-snapshot.md
```

## Stats — counts, tag distribution, freshness

```bash
mnotes kb stats
```

## Scan for conflicting / duplicate knowledge

```bash
mnotes kb scan-conflicts
```

Re-runs the conflict detector across the KB. Inspect results with:

```bash
mnotes kb conflicts [--status open|resolved] [--limit <n>]
```

## Consolidate near-duplicate notes

```bash
mnotes kb consolidate --note-ids "<id1>,<id2>,..." --target-title "<title>" --strategy merge|summarize
```

- **--note-ids** (required): Comma-separated source note IDs to consolidate.
- **--target-title** (required): Title for the resulting consolidated note.
- **--strategy** (required): `merge` (concatenate + dedupe) or `summarize` (LLM-summarized).

Source notes are archived after consolidation. Review the output before relying on it — the operation is durable.

## Decay — surface stale entries

```bash
mnotes kb decay [--threshold <0..1>] [--limit <n>] [--decay-window <days>] [--tags <csv>] [--max-importance <n>]
```

- **--threshold**: Minimum decay score 0.0–1.0 (default 0.5).
- **--decay-window**: Days for full decay (default 90, max 365).
- **--limit**: Max entries returned (default 20, max 200).

Decay score = `min(1.0, daysSinceUpdate / decayWindow)` — 0 is fresh, 1 is fully stale.

## Archive stale knowledge

Two mutually exclusive modes:

```bash
# Key-mode — archive a specific entry or list
mnotes kb archive --key "<category/name>"
mnotes kb archive --keys "<key1>,<key2>"

# Threshold-mode — archive everything matching a decay/importance threshold
mnotes kb archive --max-decay-score <0..1> --max-importance <n> [--dry-run]
```

Use `--dry-run` in threshold-mode to preview without writing.

## Tips
- Run `mnotes kb stats` before/after large ingests to verify growth and tag balance.
- `snapshot` is read-only and safe to run anytime; `consolidate`/`archive` are destructive — confirm with the user first.
- For non-knowledge note exports, see `mnotes note list --json` paginated.
