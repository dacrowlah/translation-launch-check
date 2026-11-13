import { resultOf, type LineCheck, type Spec } from "./compare";
import { spellingFix } from "./spelling";

export const LOCALE_SPELLING_DETAIL = "A word is not spelled the way this market spells it.";

const SPELLING: Spec = { check: "locale_spelling", detail: LOCALE_SPELLING_DETAIL };

export const checkLocaleSpelling: LineCheck = (pair, ctx) => {
  const applicable = Object.hasOwn(ctx.rules.spelling, pair.locale);
  const { changes } = spellingFix(pair.targetText, pair.locale, ctx.rules);
  const found = changes.map(([from]) => from).join(", ");
  const expected = changes.map(([, to]) => to).join(", ");
  return resultOf(ctx.rules, SPELLING, applicable, changes.length === 0 ? [] : [[expected, found]]);
};
