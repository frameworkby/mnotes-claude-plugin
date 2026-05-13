---
name: ingest
description: Batch-import knowledge entries into m-notes (upsert by key, up to 50 per call). Use when the user says /ingest or asks to bulk-load notes, import a list of decisions/patterns, or seed the knowledge base from a file.
---

# Batch-Ingest Knowledge into m-notes

Run `mnotes kb ingest` via Bash to upsert multiple entries in a single call. Each entry is keyed — new keys create, existing keys update. The entire batch is validated before any writes; one invalid entry rejects the whole call.

## Command — from a JSON file

```bash
mnotes kb ingest --file <path-to-entries.json>
```

## Command — inline JSON

```bash
mnotes kb ingest --entries '[{"key":"arch/db","content":"…","tags":["architecture"]}]'
```

`--file` and `--entries` are mutually exclusive; one is required.

## Entry schema

```json
[
  {
    "key": "arch/database",
    "content": "Markdown content with rationale.",
    "tags": ["architecture", "decision"]
  }
]
```

- **key** (required): `<category>/<name>` — see `/mnotes:store` for category conventions.
- **content** (required): Markdown body.
- **tags** (optional): String array.

## Limits & gotchas
- Max **50 entries per call** — split larger batches.
- Validate the JSON locally first (`jq . entries.json`) to avoid losing the whole batch to a typo.
- For ingesting from external sources (URLs, files outside the JSON schema), see `mnotes kb ingest-external`.
- For a single entry, prefer `/mnotes:store`.
