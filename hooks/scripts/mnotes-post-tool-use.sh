#!/usr/bin/env bash
# PostToolUse hook: auto-appends a wiki/log entry for tool calls made through
# Claude Code, across multiple tool families.
#
# Reads Claude Code's PostToolUse JSON envelope from stdin.
# Always exits 0 — never blocks Claude Code.
# State dir: ~/.claude/plugins/mnotes/state (stable per-user path).
#
# ── Tool family → log mapping ────────────────────────────────────────────────
# Tool family                | kind     | ref                | Notes
# ---------------------------|----------|--------------------|-------------------------
# Bash: mnotes note create   | ingest   | --title or stdout  | legacy
# Bash: mnotes note update   | ingest   | --title or stdout  | legacy
# Bash: mnotes note-ops      | ingest   | --title or stdout  | legacy
# Bash: mnotes search        | query    | --query or arg     | legacy
# Bash: mnotes recall-*      | query    | --query or arg     | legacy
# Bash: mnotes kb recall     | query    | --query or arg     | legacy
# Bash: mnotes bulk *recall  | query    | --query or arg     | legacy
# Bash: mnotes wiki lint     | lint     | check name or all  | legacy
# Bash: mnotes kb scan-conf  | lint     | check name or all  | legacy
# Read tool                  | ingest   | file_path          | NEW (#13)
# Edit tool (decision path)  | decision | file_path          | NEW (#13)
# Edit tool (default)        | ingest   | file_path          | NEW (#13)
# Write tool (decision path) | decision | file_path          | NEW (#13)
# Write tool (default)       | ingest   | file_path          | NEW (#13)
# Bash: git checkout -b ...  | decision | branch name        | NEW (#13) allowlist
# Bash: git commit ...       | decision | "git commit"       | NEW (#13)
# Bash: gh pr create         | decision | "gh pr create"     | NEW (#13)
# Bash: gh pr merge          | decision | "gh pr merge"      | NEW (#13)
# Bash: gh release create    | decision | "gh release create"| NEW (#13)
# Bash: npm/pnpm/yarn publish| decision | "<pkgmgr> publish" | NEW (#13)
# Anything else              | skipped  | —                  | silent
#
# Configuration:
#   MNOTES_HOOK_DECISION_ALLOW   Comma-separated extra regexes appended to the
#                                Bash decision allowlist.
#   MNOTES_HOOK_DECISION_PATHS   Comma-separated extra regexes appended to the
#                                Edit/Write decision-path list.
#   MNOTES_HOOK_DEBUG=1          Append a debug line per emission.

set -uo pipefail

_STATE_DIR=~/.claude/plugins/mnotes/state

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

_payload=$(cat)

_tool_name=$(printf '%s' "$_payload" | jq -r '.tool_name // empty' 2>/dev/null) || true
_command=$(printf '%s' "$_payload" | jq -r '.tool_input.command // empty' 2>/dev/null) || true
_file_path=$(printf '%s' "$_payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || true
_stdout=$(printf '%s' "$_payload" | jq -r '.tool_response.stdout // empty' 2>/dev/null) || true
_session_id=$(printf '%s' "$_payload" | jq -r '.session_id // empty' 2>/dev/null) || true

_kind=""
_ref=""

# ── Decision-path regex (Edit/Write) ─────────────────────────────────────────
_DEFAULT_DECISION_PATHS='(^|/)CLAUDE\.md$|(^|/)\.claude/settings(\.local)?\.json$|(^|/)presets/[^/]+/CLAUDE\.md$'
_decision_paths_regex="${_DEFAULT_DECISION_PATHS}"
if [ -n "${MNOTES_HOOK_DECISION_PATHS:-}" ]; then
  _extra=$(printf '%s' "${MNOTES_HOOK_DECISION_PATHS}" | tr ',' '|')
  _decision_paths_regex="${_decision_paths_regex}|${_extra}"
fi

# ── Bash decision allowlist ──────────────────────────────────────────────────
_DEFAULT_BASH_DECISION_ALLOW='^git[[:space:]]+checkout[[:space:]]+-b[[:space:]]+|^git[[:space:]]+commit([[:space:]]|$)|^gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)|^gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)|^gh[[:space:]]+release[[:space:]]+create([[:space:]]|$)|^(npm|pnpm|yarn)[[:space:]]+publish([[:space:]]|$)'
_bash_decision_regex="${_DEFAULT_BASH_DECISION_ALLOW}"
if [ -n "${MNOTES_HOOK_DECISION_ALLOW:-}" ]; then
  _extra=$(printf '%s' "${MNOTES_HOOK_DECISION_ALLOW}" | tr ',' '|')
  _bash_decision_regex="${_bash_decision_regex}|${_extra}"
fi

# ── Tool family dispatch ─────────────────────────────────────────────────────

case "${_tool_name}" in
  Read)
    [ -z "${_file_path}" ] && exit 0
    _kind="ingest"
    _ref="${_file_path}"
    ;;

  Edit|Write)
    [ -z "${_file_path}" ] && exit 0
    if printf '%s' "${_file_path}" | grep -qE "${_decision_paths_regex}"; then
      _kind="decision"
    else
      _kind="ingest"
    fi
    _ref="${_file_path}"
    ;;

  Bash)
    _cmd_trim=$(printf '%s' "${_command}" | sed 's/^[[:space:]]*//')

    if printf '%s' "${_cmd_trim}" | grep -qE '^mnotes[[:space:]]'; then
      # ── Legacy mnotes classifier ────────────────────────────────────────
      if printf '%s' "${_command}" | grep -qE '(note[[:space:]]+create|note[[:space:]]+update|note-ops[[:space:]]+append)'; then
        _kind="ingest"
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
      elif printf '%s' "${_command}" | grep -qE '\bsearch\b|recall-knowledge|kb[[:space:]]+recall|bulk[[:space:]]+knowledge-recall'; then
        _kind="query"
        if printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+'"'"'([^'"'"']+)'"'"''; then
          _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+'"'"'([^'"'"']+)'"'"'' | sed "s/--query[[:space:]]*'//;s/'//") || true
        elif printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+"([^"]+)"'; then
          _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+"([^"]+)"' | sed 's/--query[[:space:]]*"//;s/"//') || true
        elif printf '%s' "${_command}" | grep -qE -- '--query[[:space:]]+[^[:space:]]+'; then
          _ref=$(printf '%s' "${_command}" | grep -oE -- '--query[[:space:]]+[^[:space:]]+' | sed 's/--query[[:space:]]*//' | head -1) || true
        else
          _ref=$(printf '%s' "${_command}" | grep -oE '(search|recall-knowledge|kb[[:space:]]+recall|bulk[[:space:]]+knowledge-recall)[[:space:]]+[^[:space:]]+' | awk '{print $NF}' | head -1 | grep -vE '^(\||&|;|<|>|[12]?>|>>|&&|\|\|)' | sed 's/[;&]$//') || true
        fi
        if [ -z "${_ref}" ]; then
          _ref="query"
        fi
      elif printf '%s' "${_command}" | grep -qE '(wiki[[:space:]]+lint|kb[[:space:]]+scan-conflicts)'; then
        _kind="lint"
        _ref=$(printf '%s' "${_command}" | grep -oE '(wiki[[:space:]]+lint|kb[[:space:]]+scan-conflicts)[[:space:]]+[^[:space:]]+' | awk '{print $NF}' | head -1 | grep -vE '^(\||&|;|<|>|[12]?>|>>|&&|\|\|)' | sed 's/[;&]$//') || true
        if [ -z "${_ref}" ]; then
          _ref="all"
        fi
      else
        exit 0
      fi
    else
      # Non-mnotes Bash → only log if decision allowlist matches.
      if printf '%s' "${_cmd_trim}" | grep -qE "${_bash_decision_regex}"; then
        _kind="decision"
        if printf '%s' "${_cmd_trim}" | grep -qE '^git[[:space:]]+checkout[[:space:]]+-b[[:space:]]+'; then
          _ref=$(printf '%s' "${_cmd_trim}" | awk '{print $4}')
          [ -z "${_ref}" ] && _ref="git checkout -b"
        elif printf '%s' "${_cmd_trim}" | grep -qE '^git[[:space:]]+commit'; then
          _ref="git commit"
        elif printf '%s' "${_cmd_trim}" | grep -qE '^gh[[:space:]]+pr[[:space:]]+create'; then
          _ref="gh pr create"
        elif printf '%s' "${_cmd_trim}" | grep -qE '^gh[[:space:]]+pr[[:space:]]+merge'; then
          _ref="gh pr merge"
        elif printf '%s' "${_cmd_trim}" | grep -qE '^gh[[:space:]]+release[[:space:]]+create'; then
          _ref="gh release create"
        elif printf '%s' "${_cmd_trim}" | grep -qE '^(npm|pnpm|yarn)[[:space:]]+publish'; then
          _ref=$(printf '%s' "${_cmd_trim}" | awk '{print $1" "$2}')
        else
          _ref=$(printf '%s' "${_cmd_trim}" | awk '{print $1" "$2}')
        fi
      else
        exit 0
      fi
    fi
    ;;

  *)
    exit 0
    ;;
esac

# ── Dedup (5-min sliding window) ─────────────────────────────────────────────

_DEDUP_FILE="${_STATE_DIR}/postusetool.dedup"
mkdir -p "${_STATE_DIR}" || true

_hash=""
if command -v shasum >/dev/null 2>&1; then
  _hash=$(printf '%s|%s' "${_kind}" "${_ref}" | shasum -a 256 | cut -d' ' -f1) || true
elif command -v sha256sum >/dev/null 2>&1; then
  _hash=$(printf '%s|%s' "${_kind}" "${_ref}" | sha256sum | cut -d' ' -f1) || true
fi

if [ -z "${_hash}" ]; then
  _hash="nohash-${_kind}-${RANDOM}"
fi

_now=$(date +%s) || true

if [ -f "${_DEDUP_FILE}" ]; then
  _cutoff=$(( _now - 300 ))
  awk -v cutoff="${_cutoff}" '$1 > cutoff' "${_DEDUP_FILE}" > "${_DEDUP_FILE}.tmp" && mv "${_DEDUP_FILE}.tmp" "${_DEDUP_FILE}" || true
  if grep -qE " ${_hash}$" "${_DEDUP_FILE}" 2>/dev/null; then
    exit 0
  fi
fi

printf '%s %s\n' "${_now}" "${_hash}" >> "${_DEDUP_FILE}" || true
tail -n 200 "${_DEDUP_FILE}" > "${_DEDUP_FILE}.tmp" && mv "${_DEDUP_FILE}.tmp" "${_DEDUP_FILE}" || true

# ── Session rate cap (30 per session) ────────────────────────────────────────

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

# ── Build summary ────────────────────────────────────────────────────────────

_summary=$(printf '%s' "${_stdout}" | grep -m1 -v '^[[:space:]]*$' | awk 'NR==1{ if(length($0)<=80){print $0;exit} n=split($0,w," "); r=""; for(i=1;i<=n;i++){t=(r==""?w[i]:r" "w[i]); if(length(t)>80)break; r=t}; print r}') || true

if [ -z "${_summary}" ]; then
  case "${_tool_name}" in
    Read)  _summary="Read ${_ref}" ;;
    Edit)  _summary="Edited ${_ref}" ;;
    Write) _summary="Wrote ${_ref}" ;;
    Bash)  _summary="${_ref}" ;;
  esac
fi

# ── Append wiki log entry ────────────────────────────────────────────────────

mnotes wiki log append --kind "${_kind}" --ref "${_ref}" --summary "${_summary}" >/dev/null 2>&1 || true

# ── Optional debug log ───────────────────────────────────────────────────────

if [ "${MNOTES_HOOK_DEBUG:-}" = "1" ]; then
  printf '%s tool=%s kind=%s ref=%s summary=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_tool_name}" "${_kind}" "${_ref}" "${_summary}" >> "${_STATE_DIR}/postusetool.debug.log" || true
fi

exit 0
