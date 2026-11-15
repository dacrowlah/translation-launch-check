import type { Money } from "../tokens/money";
import { unique } from "../tokens/tally";
import { diffRows, multisetDiff, resultOf, type MultiCheck, type Row, type Spec } from "./compare";

export const CURRENCY_AMOUNT_DETAIL = "A price differs from the master.";
export const CURRENCY_CODE_DETAIL =
  "The currency differs from the master; confirm the local price.";

const AMOUNT: Spec = { check: "currency_amount", detail: CURRENCY_AMOUNT_DETAIL };
const CODE: Spec = { check: "currency_code", detail: CURRENCY_CODE_DETAIL };

/** "50" shows as "50.00 USD"; "1.299" keeps its third decimal place. */
const show = ({ amount, currency }: Money): string => {
  const [whole, fraction = ""] = amount.split(".");
  return `${whole}.${fraction.padEnd(2, "0")} ${currency}`;
};

const codesOf = (moneys: readonly Money[]): string[] => unique(moneys.map((m) => m.currency));
const amountsIn = (moneys: readonly Money[], code: string): string[] =>
  moneys.filter((m) => m.currency === code).map(show);
const joined = (codes: readonly string[]): string | undefined =>
  codes.length > 0 ? codes.join(", ") : undefined;

/** One row for the whole line: the currencies only one side uses. */
const codeRows = (a: readonly Money[], b: readonly Money[]): Row[] => {
  const { missing, extra } = multisetDiff(codesOf(a), codesOf(b));
  return missing.length + extra.length > 0 ? [[joined(missing), joined(extra)]] : [];
};

/** Amounts are compared per currency, for the currencies both sides use. */
const amountRows = (a: readonly Money[], b: readonly Money[]): Row[] =>
  codesOf(a)
    .filter((code) => codesOf(b).includes(code))
    .flatMap((code) => diffRows(amountsIn(a, code), amountsIn(b, code)));

export const checkCurrency: MultiCheck = (pair, ctx) => {
  const [a, b] = [pair.master.money, pair.target.money];
  const applicable = a.length + b.length > 0;
  return {
    currency_amount: resultOf(ctx.rules, AMOUNT, applicable, amountRows(a, b)),
    currency_code: resultOf(ctx.rules, CODE, applicable, codeRows(a, b)),
  };
};
