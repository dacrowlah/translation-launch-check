import { measure } from "../copy-fit";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";

export const LENGTH_RATIO_DETAIL = "The translation is much longer than the master.";

const SPEC: Spec = { check: "length_ratio", detail: LENGTH_RATIO_DETAIL };

const rowsOf = (base: number, size: number, max: number): Row[] =>
  size > base * max ? [[String(Math.floor(base * max)), String(size)]] : [];

/** Applies from a master of `length_ratio_min_chars` characters, in a locale with a ratio. */
export const checkLengthRatio: LineCheck = (pair, ctx) => {
  const [max, base] = [ctx.rule.length_ratio_max, measure(pair.masterText, "chars")];
  if (max === undefined || base < ctx.rules.length_ratio_min_chars) {
    return resultOf(ctx.rules, SPEC, false, []);
  }
  return resultOf(ctx.rules, SPEC, true, rowsOf(base, measure(pair.targetText, "chars"), max));
};
