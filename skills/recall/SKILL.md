---
name: recall
description: Recall knowledge from m-notes using semantic search. Use when the user says /recall or asks to find/recall/search knowledge, or needs context about a topic.
---

# Recall Knowledge from m-notes

Run the `mnotes kb recall` CLI command via Bash to search stored knowledge.

## Command

```bash
mnotes kb recall --query "<natural language query>" [--tags "<tag1>,<tag2>"] [--limit <n>]
```

## Parameters
- **--query**: Natural language description of what you are looking for (required)
- **--tags**: Comma-separated tags to filter results
- **--limit**: Maximum number of results to return (default 10, max 50)

Workspace is resolved automatically from the CLI config. Do not pass `--workspace-id`.

Output may be followed by a **Related tasks** footer (with `--json`: `{ results, relatedTasks }`): existing board tasks tied to the result notes or matching the query. Before creating a board task, check these — if one matches, pick it up (`mnotes board move <id> in_progress`, `mnotes board update <id> --assignee claude-code`, `mnotes board comment <id> "…"`) instead of creating a duplicate.

## Tips
- Be specific in your query for better semantic matching
- Use `mnotes bulk knowledge-recall --tags "arch/*"` to recall groups of entries by tag prefix
- Use `mnotes kb snapshot` to export all knowledge at once
