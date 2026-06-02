---
name: facts
description: Extract, query, and traverse bi-temporal facts in the m-notes knowledge graph. Use for /facts or "what did we know about X as of <date>", "who works at Y now", point-in-time recall.
---

# Facts — bi-temporal knowledge graph

The m-notes fact graph stores subject-predicate-object facts with two time axes
(event time and ingest time), so you can ask both "what is true now" and "what
did we know/was true as of some date". Run these via Bash.

## Extract facts from notes (backfill)

```bash
mnotes graph extract              # extract facts from notes not yet processed
mnotes graph extract --full       # re-scan every note in the workspace
```

Returns `{ episodes, facts }` — `episodes` = notes dispatched for extraction,
`facts` = total facts currently in the workspace. Extraction is async/fire-and-
forget, so the fact count may keep growing for a few seconds after the call.

Note: extraction is opt-in on the server (`GRAPH_EXTRACTION_ENABLED=1` plus AI +
embeddings configured); if it is off, no facts are produced.

## List facts (current or point-in-time)

```bash
mnotes graph facts
mnotes graph facts --subject <entityId>
mnotes graph facts --predicate works_at
mnotes graph facts --predicate works_at --as-of 2025-01-01T00:00:00Z
mnotes graph facts --limit 50
```

`--as-of <ISO>` returns the facts that were true at that event time; omit it for
current truth. Returns a JSON array of facts:

```json
[
  {
    "id": "ckxyz...",
    "statement": "Alice works at Acme Corp",
    "predicate": "works_at",
    "confidence": 1.0,
    "sourceNoteId": "ck...",
    "subjectId": "ck...",
    "objectId": "ck...",
    "score": 100
  }
]
```

## Traverse the fact graph from an entity

```bash
mnotes graph traverse-facts --start <entityId>
mnotes graph traverse-facts --start <entityId> --depth 3
mnotes graph traverse-facts --start <entityId> --predicates works_at,reports_to
mnotes graph traverse-facts --start <entityId> --as-of 2025-01-01T00:00:00Z
```

Walks the fact graph (entities connected via facts) up to `--depth` hops (1-3,
default 2), filtered to the given predicates, as of the given date. Returns:

```json
{
  "entities": [{ "id": "...", "name": "Alice", "entityType": "person", "depth": 0 }],
  "facts": [{ "id": "...", "subjectId": "...", "objectId": "...", "predicate": "works_at", "statement": "...", "confidence": 1.0 }],
  "nodeCount": 5,
  "edgeCount": 7
}
```

## Tips
- Predicates are snake_case (`works_at`, `lives_in`, `reports_to`); the CLI
  normalizes whatever you pass.
- Get an entity ID first by traversing or by inspecting a `facts` result
  (`subjectId` / `objectId`).
- Use `--as-of` for historical questions ("who was the CEO as of 2024?"); leave
  it off for "right now".
