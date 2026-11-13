import { measure } from "../copy-fit";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";

export const LENGTH_RATIO_DETAIL = "The translation is much longer than the master.";

const SPEC: Spec = { check: "length_ratio", detail: LENGTH_RATIO_DETAIL };

const rowsOf = (base: number, size: number, max: number | undefined): Row[] =>
  max !== undefined && size > base * max ? [[String(Math.floor(base * max)), String(size)]] : [];

export const checkLengthRatio: LineCheck = (pair, ctx) => {
  const max = ctx.rules.locales[pair.locale]?.length_ratio_max;
  const base = measure(pair.masterText, "chars");
  const rows = rowsOf(base, measure(pair.targetText, "chars"), max);
  return resultOf(ctx.rules, SPEC, max !== undefined && base > 0, rows);
};
