#!/usr/bin/env bash
# Mark test gate: pytest over <root>/mark, green only when at least one test passed and none
# was skipped, deselected or xfailed. Usage: mark-test-gate.sh [root] (default: the repo).
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${1:-$HERE}"
out="$(cd "$ROOT" && "$HERE/.venv/bin/pytest" mark -q -p no:cacheprovider 2>&1)"
status=$?
printf '%s\n' "$out"
[ "$status" -eq 0 ] || exit 1
last="$(printf '%s\n' "$out" | tail -1)"
if printf '%s' "$last" | grep -Eq '(^|[^0-9])[1-9][0-9]* passed' &&
  ! printf '%s' "$last" | grep -Eq 'skipped|deselected|xfail|xpass'; then
  exit 0
fi
echo "mark-test gate: no tests ran, or some were skipped: $last"
exit 1
