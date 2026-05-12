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

if [ -n "$_context" ]; then
  # Wrap in the SessionStart hook JSON envelope so Claude Code injects the
  # context as additionalContext for the session.
  # Uses jq when available for safe JSON encoding; falls back to printf.
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$_context" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
  else
    # Minimal fallback: escape backslashes and double-quotes only.
    _escaped=$(printf '%s' "$_context" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/g' | tr -d '\n')
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$_escaped"
  fi
fi
