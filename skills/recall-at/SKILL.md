---
name: recall-at
description: Point-in-time (bi-temporal) recall from the m-notes fact graph. Use for /recall-at or time-scoped questions like "who was the CEO as of 2024?", "what did we know about X on <date>", "where did Alice work in January?", or "what is true now". Answers as-of a specific event time, not just current truth.
---

# Recall facts as of a point in time

The m-notes fact graph is bi-temporal: every fact records when it became true
in the world (event time) and when we learned it (ingest time). This skill is
for **time-scoped** questions — "what was true as of `<date>`" — versus
plain current recall. Run everything below via Bash.

## How to answer a point-in-time question

1. If the question names a date, convert it to an ISO-8601 instant and pass it
   as `--as-of`. Omit `--as-of` for "right now".
2. If you know the subject entity, filter with `--subject <entityId>` and/or
   `--predicate <p>`. Otherwise list and scan, or traverse from a seed entity.

### As-of a date (event time)

```bash
mnotes graph facts --as-of 2024-01-01T00:00:00Z
mnotes graph facts --predicate ceo_of --as-of 2024-01-01T00:00:00Z
mnotes graph facts --subject <entityId> --as-of 2024-01-01T00:00:00Z
```

Returns the facts that were true at that event time, filtered to current
records (superseded/corrected rows are excluded). Omit `--as-of` to get current
truth (`now()`).

```json
[
  {
    "id": "ck...",
    "statement": "Alice was CEO of Acme Corp",
    "predicate": "ceo_of",
    "confidence": 1.0,
    "sourceNoteId": "ck...",
    "subjectId": "ck...",
    "objectId": "ck...",
    "score": 100
  }
]
```

### Time-scoped traversal (subgraph as of a date)

```bash
mnotes graph traverse-facts --start <entityId> --as-of 2024-01-01T00:00:00Z
mnotes graph traverse-facts --start <entityId> --depth 3 --predicates works_at,reports_to --as-of 2024-01-01T00:00:00Z
```

Walks the fact graph as it stood at the given event time (point-in-time
subgraph), filtered to the given predicates, up to `--depth` hops (1-3,
default 2). Returns `{ entities, facts, nodeCount, edgeCount }`.

## Cite your answer

Every fact carries `statement` (natural-language form) and `sourceNoteId`.
When you answer a recall question, quote the `statement` and cite the
`sourceNoteId` so the user can trace it back to the originating note.

## Tips
- Predicates are snake_case (`works_at`, `ceo_of`, `lives_in`, `reports_to`);
  the CLI normalizes whatever you pass.
- "now" vs "as of": leave `--as-of` off for current truth; supply it for
  history. The two can disagree when a fact was later superseded.
- Need to extract or browse all facts (not time-scoped)? Use the `/facts`
  skill, which covers `graph extract` and unfiltered `graph facts`.
- Get an entity ID from a prior `facts` result (`subjectId` / `objectId`) or
  from a `traverse-facts` run before drilling in with `--subject`.
