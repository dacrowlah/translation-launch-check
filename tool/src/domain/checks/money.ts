import type { Money } from "../tokens/money.js";
import { unique } from "../tokens/tally.js";
import type { CheckResult } from "../types.js";
import {
  diffRows,
  multisetDiff,
  resultOf,
  unsureResult,
  type LocaleContext,
  type MultiCheck,
  type Row,
  type Spec,
} from "./compare.js";

export const CURRENCY_AMOUNT_DETAIL = "A price differs from the master.";
export const CURRENCY_CODE_DETAIL =
  "The currency differs from the master; confirm the local price.";
const UNREAD = "Couldn't find the master's price in this line. Is it written in a form the tool";
/** The unsure question, in terms of the forms each script's copy uses. */
export const UNREAD_LATIN_DETAIL = `${UNREAD} can't read (in words, or glued to a word), or is it missing?`;
export const UNREAD_JAPANESE_DETAIL = `${UNREAD} can't read (kanji numerals), or is it missing?`;

const AMOUNT: Spec = { check: "currency_amount", detail: CURRENCY_AMOUNT_DETAIL };
const CODE: Spec = { check: "currency_code", detail: CURRENCY_CODE_DETAIL };
const unreadSpec = (ctx: LocaleContext): Spec => ({
  check: "currency_code",
  detail: ctx.rule.script === "japanese" ? UNREAD_JAPANESE_DETAIL : UNREAD_LATIN_DETAIL,
});

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

interface CodeDiff {
  readonly row: Row;
  /** The translation has a currency the master lacks, or one in place of the master's. */
  readonly changed: boolean;
  /** A master currency with nothing in its place: maybe a price the tool could not read. */
  readonly unread: boolean;
}

/** One row for the whole line: the currencies only one side uses. */
const codeDiff = (a: readonly Money[], b: readonly Money[]): CodeDiff => {
  const { missing, extra } = multisetDiff(codesOf(a), codesOf(b));
  const row: Row = [joined(missing), joined(extra)];
  return { row, changed: extra.length > 0, unread: missing.length > 0 && extra.length === 0 };
};

/** An unread master price is an unsure question; a changed currency is a certain finding. */
const codeResult = (ctx: LocaleContext, applicable: boolean, diff: CodeDiff): CheckResult =>
  diff.unread
    ? unsureResult(ctx.rules, unreadSpec(ctx), diff.row)
    : resultOf(ctx.rules, CODE, applicable, diff.changed ? [diff.row] : []);

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
    currency_code: codeResult(ctx, applicable, codeDiff(a, b)),
  };
};
