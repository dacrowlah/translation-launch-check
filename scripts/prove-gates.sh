#!/usr/bin/env bash
# Plants one violation per gate in a scratch copy of tool/ and checks that exactly the named
# gate goes red for its named reason. A no-op control plant must leave every gate green.
# The working tree is never touched: every plant runs in its own copy under mktemp -d.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
FAILED=0

mkdir "$SCRATCH/base"
rsync -a --exclude .vitest.json "$ROOT/tool/" "$SCRATCH/base/tool/"

# plant <label> <gate script> <expected output regex> <file> <content> [<file 2> <content 2>]
plant() {
  local label="$1" script="$2" pattern="$3" file="$4" content="$5"
  local dir="$SCRATCH/$label"
  cp -Rc "$SCRATCH/base" "$dir" 2>/dev/null || cp -R "$SCRATCH/base" "$dir"
  mkdir -p "$dir/tool/$(dirname "$file")"
  printf '%s\n' "$content" >"$dir/tool/$file"
  if [ "$#" -ge 7 ]; then
    printf '%s\n' "$7" >"$dir/tool/$6"
  fi
  (cd "$dir/tool" && pnpm run "$script") >"$dir/out.log" 2>&1
  local status=$?
  if [ "$status" -ne 0 ] && grep -Eq "$pattern" "$dir/out.log"; then
    echo "OK   $label: gate '$script' is red for '$pattern'"
    echo "       > $(grep -Em1 "$pattern" "$dir/out.log" | cut -c1-150)"
  else
    echo "FAIL $label: gate '$script' exit $status, pattern '$pattern'; output follows"
    head -30 "$dir/out.log"
    FAILED=1
  fi
}

control() {
  local dir="$SCRATCH/control" script
  cp -Rc "$SCRATCH/base" "$dir" 2>/dev/null || cp -R "$SCRATCH/base" "$dir"
  mkdir -p "$dir/tool/src/domain"
  printf 'export const noop = 1;\n' >"$dir/tool/src/domain/noop.ts"
  for script in format:check lint lint:directives typecheck dup test:gate; do
    if ! (cd "$dir/tool" && pnpm run "$script") >"$dir/$script.log" 2>&1; then
      echo "FAIL control: gate '$script' is red on a no-op plant (see $dir/$script.log)"
      FAILED=1
      return
    fi
  done
  echo "OK   control: every gate is green on a no-op plant"
}

# A block of more than 50 tokens, under the function name given.
dup_block() {
  cat <<BLOCK
export function $1(input: number[], factor: number): number[] {
  const scaled = input.map((value) => value * factor + 1);
  const shifted = scaled.map((value) => value - factor * 2);
  const clipped = shifted.filter((value) => value > 0 && value < 1000);
  const doubled = clipped.map((value) => value * 2 + factor);
  return doubled.filter((value) => value % 2 === 0 || value > 10);
}
BLOCK
}

plant metz-function-length lint 'metz/max-counted-lines' src/domain/long.ts \
'export function long(a: number): number {
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  return f;
}'
plant architecture-layer test 'domain must not import \.\./infrastructure/x' \
  src/domain/a.ts 'import { x } from "../infrastructure/x";
export const a = x;'
plant date-now-in-domain lint 'Date\.now\(\) belongs in' src/domain/now.ts \
  'export const now = (): number => Date.now();'
plant unformatted format:check 'Code style issues found' src/domain/ugly.ts \
  'export const   ugly   =   {a:1,b:2}'
plant duplicate-block dup 'Clone found' src/domain/dup-a.ts "$(dup_block first)" \
  src/domain/dup-b.ts "$(dup_block second)"
plant skipped-test test:gate '1 skipped or todo' test/skipped.test.ts \
  'import { it } from "vitest";
it.skip("skipped", () => {});'
plant type-error typecheck 'TS2322' src/domain/bad.ts 'export const x: number = "a";'
plant waiver-without-reason lint:directives 'needs .-- <description>.' \
  src/domain/waiver.ts '// eslint-disable-next-line metz/max-params
export const w = 1;'
control

[ "$FAILED" -eq 0 ] && echo "prove-gates: every plant failed its own gate; control green"
exit "$FAILED"
