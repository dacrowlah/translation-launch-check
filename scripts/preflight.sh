#!/usr/bin/env bash
# Runs every gate, each one's output to .preflight/<gate>.log; stops at the first failure.
# Mark gates are added alongside (see docs/standards/MARK.md section 6).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.preflight"
mkdir -p "$LOGS"

# <log name>:<pnpm script inside tool/>
TOOL_GATES=(
  "format:format:check"
  "lint:lint"
  "directives:lint:directives"
  "typecheck:typecheck"
  "dup:dup"
  "test:test:gate"
)

run_gate() {
  local name="${1%%:*}" script="${1#*:}"
  if (cd "$ROOT/tool" && pnpm run "$script") >"$LOGS/$name.log" 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name (see $LOGS/$name.log)"
    return 1
  fi
}

for gate in "${TOOL_GATES[@]}"; do
  run_gate "$gate" || exit 1
done
echo "preflight: all gates green"
