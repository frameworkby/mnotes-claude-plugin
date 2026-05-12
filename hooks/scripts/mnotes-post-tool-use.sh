#!/usr/bin/env bash
# PostToolUse hook: auto-appends a wiki/log entry for every mnotes CLI call
# made through Claude Code's Bash tool.
# Reads Claude Code's PostToolUse JSON envelope from stdin.
# Always exits 0 — never blocks Claude Code.
# State dir: ~/.claude/plugins/mnotes/state (stable per-user path; idiomatic for plugin-owned state).
set -uo pipefail

# Per-user state dir — stable across plugin reinstalls/updates.
_STATE_DIR=~/.claude/plugins/mnotes/state

# Require jq — exit 0 silently if missing.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# Read stdin JSON envelope.
_payload=$(cat)

# Parse fields from the envelope.
_tool_name=$(printf '%s' "$_payload" | jq -r '.tool_name // empty' 2>/dev/null) || true
_command=$(printf '%s' "$_payload" | jq -r '.tool_input.command // empty' 2>/dev/null) || true
_stdout=$(printf '%s' "$_payload" | jq -r '.tool_response.stdout // empty' 2>/dev/null) || true
_session_id=$(printf '%s' "$_payload" | jq -r '.session_id // empty' 2>/dev/null) || true

# Filter: only handle Bash tool calls.
if [ "${_tool_name}" != "Bash" ]; then
  exit 0
fi

# Filter: only handle commands that start with 'mnotes ' (allow leading whitespace).
if ! printf '%s' "${_command}" | grep -qE '^[[:space:]]*mnotes[[:space:]]'; then
  exit 0
fi

# ── Classify ──────────────────────────────────────────────────────────────────

_kind=""
_ref=""

if printf '%s' "${_command}" | grep -qE '(notes[[:space:]]+create|notes[[:space:]]+update|wiki[[:space:]]+ingest)'; then
  _kind="ingest"
  # Extract --title value (single-quoted, double-quoted, or bareword).
  if printf '%s' "${_command}" | grep -qE -- '--title[[:space:]]+'"'"'([^'"'"']+)'"'"''; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--title[[:space:]]+'"'"'([^'"'"']+)'"'"'' | sed "s/--title[[:space:]]*'//;s/'//") || true
  elif printf '%s' "${_command}" | grep -qE -- '--title[[:space:]]+"([^"]+)"'; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--title[[:space:]]+"([^"]+)"' | sed 's/--title[[:space:]]*"//;s/"//') || true
  elif printf '%s' "${_command}" | grep -qE -- '--title[[:space:]]+[^[:space:]]+'; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--title[[:space:]]+[^[:space:]]+' | sed 's/--title[[:space:]]*//' | head -1) || true
  fi
  if [ -z "${_ref}" ]; then
    _ref=$(printf '%s' "${_stdout}" | tr -d '\n' | head -c 60) || true
  fi
  if [ -z "${_ref}" ]; then
    _ref="untitled"
  fi

elif printf '%s' "${_command}" | grep -qE '\bsearch\b|recall-knowledge'; then
  _kind="query"
  # Extract --query value or first positional after subcommand.
  if printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+'"'"'([^'"'"']+)'"'"''; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+'"'"'([^'"'"']+)'"'"'' | sed "s/--query[[:space:]]*'//;s/'//") || true
  elif printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+"([^"]+)"'; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+"([^"]+)"' | sed 's/--query[[:space:]]*"//;s/"//') || true
  elif printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+[^[:space:]]+'; then
    _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+[^[:space:]]+' | sed 's/--query[[:space:]]*//' | head -1) || true
  else
    # First positional arg after subcommand keyword; filter out shell redirections.
    _ref=$(printf '%s' "${_command}" | grep -oE '(search|recall-knowledge)[[:space:]]+[^[:space:]]+' | awk '{print $2}' | head -1 | grep -vE '^(\||&|;|<|>|[12]?>|>>|&&|\|\|)' | sed 's/[;&]$//') || true
  fi
  if [ -z "${_ref}" ]; then
    _ref="query"
  fi

elif printf '%s' "${_command}" | grep -qE '(wiki[[:space:]]+lint|kb[[:space:]]+scan-conflicts)'; then
  _kind="lint"
  # Extract check name after subcommand or default to "all"; filter out shell redirections.
  _ref=$(printf '%s' "${_command}" | grep -oE '(wiki[[:space:]]+lint|kb[[:space:]]+scan-conflicts)[[:space:]]+[^[:space:]]+' | awk '{print $NF}' | head -1 | grep -vE '^(\||&|;|<|>|[12]?>|>>|&&|\|\|)' | sed 's/[;&]$//') || true
  if [ -z "${_ref}" ]; then
    _ref="all"
  fi

else
  exit 0
fi

# ── Dedup (5-min sliding window) ──────────────────────────────────────────────

_DEDUP_FILE="${_STATE_DIR}/postusetool.dedup"
mkdir -p "${_STATE_DIR}" || true

# Hash = sha256 of "kind|ref"
_hash=""
if command -v shasum >/dev/null 2>&1; then
  _hash=$(printf '%s|%s' "${_kind}" "${_ref}" | shasum -a 256 | cut -d' ' -f1) || true
elif command -v sha256sum >/dev/null 2>&1; then
  _hash=$(printf '%s|%s' "${_kind}" "${_ref}" | sha256sum | cut -d' ' -f1) || true
fi

if [ -z "${_hash}" ]; then
  # Can't dedup without a hash tool — proceed anyway.
  _hash="nohash-${_kind}-${RANDOM}"
fi

_now=$(date +%s) || true

# Prune lines older than 300 seconds and check for existing hash.
if [ -f "${_DEDUP_FILE}" ]; then
  # Prune stale entries (older than 300s).
  _cutoff=$(( _now - 300 ))
  awk -v cutoff="${_cutoff}" '$1 > cutoff' "${_DEDUP_FILE}" > "${_DEDUP_FILE}.tmp" && mv "${_DEDUP_FILE}.tmp" "${_DEDUP_FILE}" || true
  # Check for existing hash.
  if grep -qE " ${_hash}$" "${_DEDUP_FILE}" 2>/dev/null; then
    exit 0
  fi
fi

# Append new entry.
printf '%s %s\n' "${_now}" "${_hash}" >> "${_DEDUP_FILE}" || true
# Cap file at 50 lines.
tail -n 50 "${_DEDUP_FILE}" > "${_DEDUP_FILE}.tmp" && mv "${_DEDUP_FILE}.tmp" "${_DEDUP_FILE}" || true

# ── Session rate cap (30 per session) ─────────────────────────────────────────

if [ -n "${_session_id}" ]; then
  _SESSION_FILE="${_STATE_DIR}/postusetool.session.${_session_id}"
else
  _SESSION_FILE="${_STATE_DIR}/postusetool.session.pid$$"
fi

_count=0
if [ -f "${_SESSION_FILE}" ]; then
  _count=$(cat "${_SESSION_FILE}" 2>/dev/null) || _count=0
fi
case "${_count}" in ''|*[!0-9]*) _count=0 ;; esac

if [ "${_count}" -ge 30 ]; then
  printf 'mnotes auto-log: session cap reached\n' >&2
  exit 0
fi

printf '%s\n' "$(( _count + 1 ))" > "${_SESSION_FILE}" || true

# ── Build summary ──────────────────────────────────────────────────────────────

_summary=$(printf '%s' "${_stdout}" | grep -m1 -v '^[[:space:]]*$' | awk 'NR==1{ if(length($0)<=80){print $0;exit} n=split($0,w," "); r=""; for(i=1;i<=n;i++){t=(r==""?w[i]:r" "w[i]); if(length(t)>80)break; r=t}; print r}') || true

# ── Append wiki log entry ──────────────────────────────────────────────────────

mnotes wiki log append --kind "${_kind}" --ref "${_ref}" --summary "${_summary}" >/dev/null 2>&1 || true

# ── Optional debug log ────────────────────────────────────────────────────────

if [ "${MNOTES_HOOK_DEBUG:-}" = "1" ]; then
  printf '%s kind=%s ref=%s summary=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_kind}" "${_ref}" "${_summary}" >> "${_STATE_DIR}/postusetool.debug.log" || true
fi

exit 0
