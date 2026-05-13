#!/usr/bin/env bash
# SessionStart hook: loads project context on Claude Code session start and emits
# it as additionalContext via the SessionStart hook JSON envelope so Claude Code
# injects it into the session.
# Workspace is resolved at runtime: MNOTES_WORKSPACE_ID env → per-cwd config map → global default.
set -uo pipefail

if [ -z "${MNOTES_WORKSPACE_ID:-}" ]; then
  echo 'mnotes-session-start: MNOTES_WORKSPACE_ID not set — workspace will be resolved from config' >&2
fi

# Capture output; suppress stderr to avoid noisy session starts.
# On any failure (network, missing workspace, CLI not installed) exit 0 silently
# so the hook never blocks Claude Code from starting.
_context=$(mnotes composite project-load --query "session start" 2>/dev/null) || true

if [ -n "$_context" ] && command -v jq >/dev/null 2>&1; then
  # Shape the raw payload into a compact, model-ready markdown digest before
  # emitting. The raw project-load JSON includes scoring metadata, ids, tags,
  # and full excerpts — on workspaces with non-trivial KB content this exceeds
  # Claude Code's inline-context budget and the harness persists the payload
  # to disk, defeating the hook's purpose. See:
  # https://github.com/frameworkby/mnotes-claude-plugin/issues/1
  _MNOTES_LIMIT="${MNOTES_SESSION_START_LIMIT:-10}"
  _MNOTES_EXCERPT="${MNOTES_SESSION_START_EXCERPT:-240}"

  _digest=$(printf '%s' "$_context" | jq -r --argjson n "$_MNOTES_LIMIT" --argjson e "$_MNOTES_EXCERPT" '
    def clip($s; $max): if ($s|type) == "string" and ($s|length) > $max then ($s[0:$max] + "…") else $s end;
    (.data // .) as $d |
    [
      "# m-notes: project context",
      (if ($d.knowledge // []) | length > 0 then
        "## Knowledge (top \([$n, (($d.knowledge // []) | length)] | min) of \(($d.knowledge // []) | length))\n" +
        (($d.knowledge // []) | .[0:$n] | map("- **\(.title // .key // "(untitled)")**" + (if .excerpt then " — \(clip(.excerpt; $e))" else "" end)) | join("\n"))
      else empty end),
      (if ($d.stale_entries // []) | length > 0 then "## Stale entries: \(($d.stale_entries // []) | length)" else empty end),
      (if ($d.context // {}) | length > 0 then "## Context\n```json\n\($d.context | tojson)\n```" else empty end)
    ] | map(select(. != null and . != "")) | join("\n\n")
  ')

  if [ -n "$_digest" ]; then
    printf '%s' "$_digest" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
  fi
fi
