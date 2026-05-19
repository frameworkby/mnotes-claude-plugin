#!/usr/bin/env bash
# Smoke test: hooks/scripts/mnotes-post-tool-use.sh query classifier.
# Verifies that the canonical recall commands are recognized as kind=query
# and that unrelated commands skip logging.
#
# Usage: bash scripts/test-post-tool-use.sh
# Exit code: 0 on pass, 1 on fail.

set -uo pipefail

_HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/scripts/mnotes-post-tool-use.sh"
_DEBUG_LOG="$HOME/.claude/plugins/mnotes/state/postusetool.debug.log"

if [ ! -f "${_HOOK}" ]; then
  printf 'FAIL: hook script not found at %s\n' "${_HOOK}" >&2
  exit 1
fi

_pass=0
_fail=0

# Use a dedicated state dir so this test doesn't pollute / collide with real runs.
_TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "${_TEST_STATE_DIR}"' EXIT

_run_hook() {
  local payload="$1"
  HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 bash "${_HOOK}" <<< "${payload}"
}

_last_debug_entry() {
  local log="${_TEST_STATE_DIR}/.claude/plugins/mnotes/state/postusetool.debug.log"
  [ -f "${log}" ] || { printf ''; return; }
  tail -1 "${log}"
}

_assert_kind() {
  local label="$1"
  local cmd="$2"
  local expected_kind="$3"
  local payload
  payload=$(printf '{"tool_name":"Bash","tool_input":{"command":"%s"},"tool_response":{"stdout":"ok"},"session_id":"sid-%s"}' "${cmd}" "${RANDOM}")
  _run_hook "${payload}" >/dev/null 2>&1
  local entry
  entry=$(_last_debug_entry)
  if printf '%s' "${entry}" | grep -q "kind=${expected_kind}"; then
    printf '  PASS: %s\n' "${label}"
    _pass=$(( _pass + 1 ))
  else
    printf '  FAIL: %s — expected kind=%s, got: %s\n' "${label}" "${expected_kind}" "${entry}" >&2
    _fail=$(( _fail + 1 ))
  fi
}

_assert_skipped() {
  local label="$1"
  local cmd="$2"
  local before
  before=$(_last_debug_entry)
  local payload
  payload=$(printf '{"tool_name":"Bash","tool_input":{"command":"%s"},"tool_response":{"stdout":"ok"},"session_id":"sid-%s"}' "${cmd}" "${RANDOM}")
  _run_hook "${payload}" >/dev/null 2>&1
  local after
  after=$(_last_debug_entry)
  if [ "${before}" = "${after}" ]; then
    printf '  PASS: %s\n' "${label}"
    _pass=$(( _pass + 1 ))
  else
    printf '  FAIL: %s — expected no new entry, got: %s\n' "${label}" "${after}" >&2
    _fail=$(( _fail + 1 ))
  fi
}

printf 'PostToolUse hook smoke test\n'

# Query classifier — canonical recall commands (issue #2).
_assert_kind 'kb recall classified as query'              'mnotes kb recall --query test'              'query'
_assert_kind 'bulk knowledge-recall classified as query'  'mnotes bulk knowledge-recall --query test'   'query'
_assert_kind 'note search classified as query'            'mnotes note search --query test'             'query'
_assert_kind 'legacy recall-knowledge still works'        'mnotes recall-knowledge --query test'        'query'

# Ingest classifier.
_assert_kind 'note create classified as ingest'           "mnotes note create --title 'Foo'"            'ingest'

# Negative cases — should not log.
_assert_skipped 'note list is skipped (not query/ingest/lint)' 'mnotes note list'
_assert_skipped 'non-mnotes Bash is skipped'                   'ls -la'

printf '\nResult: %d passed, %d failed\n' "${_pass}" "${_fail}"

if [ "${_fail}" -gt 0 ]; then
  exit 1
fi
exit 0
