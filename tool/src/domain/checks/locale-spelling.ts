import { resultOf, type LineCheck, type Row, type Spec } from "./compare.js";
import { spellingFix } from "./spelling.js";

export const LOCALE_SPELLING_DETAIL = "A word is not spelled the way this market spells it.";

const SPELLING: Spec = { check: "locale_spelling", detail: LOCALE_SPELLING_DETAIL };

/** One row listing every word found and its replacement. */
const rowsOf = (changes: readonly (readonly [from: string, to: string])[]): Row[] => {
  const [from, to] = [changes.map(([word]) => word), changes.map(([, fixed]) => fixed)];
  return changes.length === 0 ? [] : [[to.join(", "), from.join(", ")]];
};

/** The finding, and the corrected line as the result's fix (computed once per line). */
export const checkLocaleSpelling: LineCheck = (pair, ctx) => {
  const applicable = Object.hasOwn(ctx.rules.spelling, pair.locale);
  const { fixed, changes } = spellingFix(pair.targetText, pair.locale, ctx.rules);
  const result = resultOf(ctx.rules, SPELLING, applicable, rowsOf(changes));
  return changes.length === 0 ? result : { ...result, fix: fixed };
};
