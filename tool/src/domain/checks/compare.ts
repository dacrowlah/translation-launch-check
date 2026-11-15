import { makeFinding } from "../finding.js";
import type { LanguageDetector } from "../ports/language-detector.js";
import type { LocaleRule, Rules } from "../rules.js";
import { countOf, countsOf, occurrences } from "../tokens/tally.js";
import type { Tokens } from "../tokens/tokenize.js";
import type { CheckId, CheckResult, Finding, PackageLine } from "../types.js";

export interface LinePair {
  readonly line: PackageLine;
  readonly locale: string;
  readonly master: Tokens;
  readonly target: Tokens;
  readonly masterText: string;
  readonly targetText: string;
}
export interface LocaleContext {
  readonly locale: string;
  /** The rule of `locale`, resolved once the locale is known to be supported. */
  readonly rule: LocaleRule;
  /** The rule of the master locale. */
  readonly masterRule: LocaleRule;
  readonly rules: Rules;
  readonly today: string;
  readonly detector: LanguageDetector;
}
export type LineCheck = (pair: LinePair, ctx: LocaleContext) => CheckResult;
export type MultiCheck = (
  pair: LinePair,
  ctx: LocaleContext,
) => Partial<Record<CheckId, CheckResult>>;

/** One difference: what the master has and the translation lacks, or the reverse. */
export type Row = readonly [expected: string | undefined, found: string | undefined];
export interface Spec {
  readonly check: CheckId;
  readonly detail: string;
}

type Key = (item: string) => string;
const asWritten: Key = (item) => item;

/** The items of `a` beyond the count of their key in `b`, in order (one pass over each). */
const without = (a: readonly string[], b: readonly string[], keyOf: Key): string[] => {
  const [keys, room] = [a.map(keyOf), countsOf(b.map(keyOf))];
  const nth = occurrences(keys);
  return a.filter((_item, i) => (nth[i] ?? 0) >= countOf(room, keys[i] ?? ""));
};

/** Items compare by `keyOf` (as written by default); the lists keep the items as written. */
export const multisetDiff = (
  a: readonly string[],
  b: readonly string[],
  keyOf: Key = asWritten,
): { missing: string[]; extra: string[] } => ({
  missing: without(a, b, keyOf),
  extra: without(b, a, keyOf),
});

/** Missing items pair with extra items by position, so a change reads as one row. */
export const diffRows = (a: readonly string[], b: readonly string[], keyOf?: Key): Row[] => {
  const { missing, extra } = multisetDiff(a, b, keyOf);
  const size = Math.max(missing.length, extra.length);
  return Array.from({ length: size }, (_, i) => [missing[i], extra[i]]);
};

const findingOf = (rules: Rules, spec: Spec, [expected, found]: Row): Finding =>
  makeFinding(rules, spec.check, {
    detail: spec.detail,
    ...(expected === undefined ? {} : { expected }),
    ...(found === undefined ? {} : { found }),
  });

/** A check that does not apply carries no findings, whatever rows it computed. */
export const resultOf = (
  rules: Rules,
  spec: Spec,
  applicable: boolean,
  rows: readonly Row[],
): CheckResult => ({
  applicable,
  findings: applicable ? rows.map((row) => findingOf(rules, spec, row)) : [],
});

type View = (pair: LinePair, rules: Rules) => readonly [readonly string[], readonly string[]];

/** A check that compares one list of strings per side as multisets, by `keyOf`. */
export const listCheck =
  (spec: Spec, view: View, keyOf?: Key): LineCheck =>
  (pair, ctx) => {
    const [a, b] = view(pair, ctx.rules);
    return resultOf(ctx.rules, spec, a.length + b.length > 0, diffRows(a, b, keyOf));
  };
