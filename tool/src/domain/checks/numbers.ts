import {
  diffRows,
  multisetDiff,
  resultOf,
  type LineCheck,
  type LinePair,
  type Row,
  type Spec,
} from "./compare";

export const NUMBERS_DETAIL = "A number differs from the master.";
const SPEC: Spec = { check: "numbers", detail: NUMBERS_DETAIL };

/** One kind's changes paired with each other, and what it leaves unpaired on each side. */
interface Kind {
  readonly rows: Row[];
  readonly missing: string[];
  readonly extra: string[];
}

const kindOf = (a: readonly string[], b: readonly string[]): Kind => {
  const { missing, extra } = multisetDiff(a, b);
  const paired = Math.min(missing.length, extra.length);
  const rows = diffRows(missing.slice(0, paired), extra.slice(0, paired));
  return { rows, missing: missing.slice(paired), extra: extra.slice(paired) };
};

/** A changed time pairs with a time and a changed number with a number; the rest by position. */
const rowsOf = (p: LinePair): Row[] => {
  const n = kindOf(p.master.numbers, p.target.numbers);
  const t = kindOf(p.master.times, p.target.times);
  const rest = diffRows([...n.missing, ...t.missing], [...n.extra, ...t.extra]);
  return [...n.rows, ...t.rows, ...rest];
};

/**
 * Numbers, percentages and clock times ("23:59"): compared per kind (a time with a time, a
 * number with a number), then what is left over, by position.
 */
export const checkNumbers: LineCheck = (p, ctx) => {
  const applicable = [p.master, p.target].some((s) => s.numbers.length + s.times.length > 0);
  return resultOf(ctx.rules, SPEC, applicable, rowsOf(p));
};
