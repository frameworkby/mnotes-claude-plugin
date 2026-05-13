---
name: session
description: Log, resume, replay, or save an AI conversation session to m-notes for an audit trail. Use when the user says /session or asks to log this conversation, save decisions, resume a prior session, or replay a session log.
---

# Manage AI Sessions in m-notes

Sessions are durable audit trails of AI conversations — summary + decisions + actions, appended to a single log note per `sessionId`. Run `mnotes session <action>` via Bash.

## Log a segment (append to the session note)

```bash
mnotes session log \
  --session-id <stable-id> \
  --summary "<what happened>" \
  [--decisions '[{"decision":"…","rationale":"…"}]'] \
  [--actions '[{"action":"…","target":"…"}]'] \
  [--tags "tag1,tag2"]
```

Re-using the same `--session-id` appends to the same log note rather than creating a new one. Pick a stable ID per logical conversation (e.g. issue number, branch name, date+topic).

## List sessions

```bash
mnotes session list [--limit <n>]
```

## Replay a session — read the full log
```bash
mnotes session replay --session-id <id>
```

## Resume — pull recent context for a session before continuing work
```bash
mnotes session resume --session-id <id>
```

## Save the current conversation as a one-shot session note
```bash
mnotes session save-conversation --session-id <id> --content "<markdown transcript>"
```

## Tips
- Log proactively when the user says "remember this conversation" or makes notable decisions.
- `decisions` and `actions` are JSON arrays — validate locally with `jq` before passing.
- For ad-hoc persistent context not tied to a conversation thread, use `/mnotes:store` instead.
