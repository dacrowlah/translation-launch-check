import { makeFinding } from "../finding";
import type { LanguageDetector } from "../ports/language-detector";
import type { LocaleRule, Rules } from "../rules";
import type { Tokens } from "../tokens/tokenize";
import type { CheckId, CheckResult, Finding, PackageLine } from "../types";

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

const without = (a: readonly string[], b: readonly string[]): string[] => {
  const left = [...b];
  return a.filter((item) => !(left.includes(item) && left.splice(left.indexOf(item), 1)));
};

export const multisetDiff = (
  a: readonly string[],
  b: readonly string[],
): { missing: string[]; extra: string[] } => ({ missing: without(a, b), extra: without(b, a) });

/** Missing items pair with extra items by position, so a change reads as one row. */
export const diffRows = (a: readonly string[], b: readonly string[]): Row[] => {
  const { missing, extra } = multisetDiff(a, b);
  const size = Math.max(missing.length, extra.length);
  return Array.from({ length: size }, (_, i) => [missing[i], extra[i]]);
};

const findingOf = (rules: Rules, spec: Spec, [expected, found]: Row): Finding =>
  makeFinding(rules, spec.check, {
    detail: spec.detail,
    ...(expected === undefined ? {} : { expected }),
    ...(found === undefined ? {} : { found }),
  });

export const resultOf = (
  rules: Rules,
  spec: Spec,
  applicable: boolean,
  rows: readonly Row[],
): CheckResult => ({ applicable, findings: rows.map((row) => findingOf(rules, spec, row)) });

type View = (pair: LinePair, rules: Rules) => readonly [readonly string[], readonly string[]];

/** A check that compares one list of strings per side as multisets. */
export const listCheck =
  (spec: Spec, view: View): LineCheck =>
  (pair, ctx) => {
    const [a, b] = view(pair, ctx.rules);
    return resultOf(ctx.rules, spec, a.length + b.length > 0, diffRows(a, b));
  };
