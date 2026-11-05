---
name: ask
description: Ask a natural-language question against the m-notes knowledge base and get an answer with cited sources. Use when the user says /ask or asks "what do we know about…", "according to the notes…", or otherwise wants a synthesized answer pulled from stored notes.
---

# Ask the m-notes Knowledge Base

Run `mnotes kb ask` via Bash. Returns an answer with a confidence score and supporting source excerpts — use this when the user wants a synthesized answer rather than a raw search result list.

## Command

```bash
mnotes kb ask --question "<natural language question>" [--limit <n>] [--context-only]
```

## Parameters
- **--question** (required): The full question. Phrase it naturally, including project context.
- **--limit**: Max sources to consider (default server-side).
- **--context-only**: Return the retrieved context, sources and evidence without generating an answer (no LLM call). Use it to inspect what the answer would be based on, or to answer from the context yourself.

## Output

JSON shape (when `--json`):

```json
{
  "answer": "…",
  "answerId": "…",
  "confidence": 0.0,
  "sources": [ { "noteId": "…", "title": "…", "excerpt": "…" } ],
  "evidence": {
    "chunks": [ { "id": "noteId#0", "noteId": "…", "chunkIndex": 0, "score": 0.0 } ],
    "nodes": [ { "id": "…", "noteId": "…", "label": "…" } ],
    "edges": [ { "id": "…", "edgeType": "wikilink", "sourceId": "…", "targetId": "…" } ]
  }
}
```

## Tips
- For a ranked list of matching notes without synthesis, use `/mnotes:search` (full-text/semantic) or `/mnotes:recall` (knowledge entries).
- If confidence is low, broaden the question or ingest more context first via `/mnotes:ingest`.
- Always relay the cited `sources` to the user so they can verify the answer.
- Sources with `via` / `linkedFrom` are graph neighbours of a direct match, not direct matches.

## Feedback

When the user says an answer was right or wrong, rate it so later answers rank its notes accordingly (re-rating replaces the previous rating):

```bash
mnotes kb feedback <answerId> --rating up|down|clear [--comment "<why>"]
```
