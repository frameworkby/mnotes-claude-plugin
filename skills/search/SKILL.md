---
name: search
description: Search m-notes by full-text or semantic similarity. Use when the user says /search or asks to find notes, look up notes by keyword, or search for content in the knowledge base.
---

# Search Notes in m-notes

Run the `mnotes search` CLI command via Bash. Use this for finding notes by title/body — for stored knowledge entries (key/value), prefer `/mnotes:recall` instead.

## Command

```bash
mnotes search "<query>" [--semantic]
```

## Parameters
- **query** (positional, required): Text to search for
- **--semantic**: Use embedding-based vector search instead of the default full-text mode. Prefer this for conceptual queries; default full-text is better for exact phrases and tokens.

## Output

Returns a ranked list of `{ id, title, snippet, score }` results. Add `--json` for machine-readable output.

## Tips
- If the user wants notes filtered by tag, use `mnotes folder search-tags --tags "<csv>"` instead.
- To recall stored knowledge entries by key, use `/mnotes:recall`.
- Use `mnotes note get <id>` (or the top-level alias `mnotes read <id>`) to fetch a full result.
