import type { LocaleRule, Rules } from "../rules";
import { listOf, ofLanguage } from "./per-language";
import { alternation } from "./regex";

/** The language's number multipliers ("\u4e07" is 10,000), each a power of ten. */
const tableOf = (locale: LocaleRule, rules: Rules): Readonly<Record<string, number>> =>
  ofLanguage(rules.number_multipliers, locale, {});

/** Every multiplier of the language as one alternation; matches nothing when there are none. */
export const multiplierNames = (locale: LocaleRule, rules: Rules): string =>
  alternation(Object.keys(tableOf(locale, rules)));

/**
 * A multiplier chain with no numeral before it ("\u5343\u5186" is 1,000), never after a kanji
 * numeral or a vague count: "\u4e8c\u4e07\u5186" and "\u6570\u4e07\u5186" stay unread, so no
 * price is invented.
 */
export const bareChain = (locale: LocaleRule, rules: Rules): string => {
  const blockers = alternation(listOf(rules.number_multiplier_blockers, locale));
  return `(?<!${blockers})${multiplierChain(locale, rules)}`;
};

/**
 * What may follow the first numeral of an amount: multipliers, then more numerals each with
 * their own, then one trailing numeral ("1\u4e072\u5343" is 12,000, "1\u5343\u4e07" is 10,000,000,
 * "1\u4e072000" is 12,000). Every inner numeral needs a multiplier after it, so a digit run
 * splits only one way (linear time).
 */
export const multiplierChain = (locale: LocaleRule, rules: Rules): string => {
  const names = multiplierNames(locale, rules);
  return `(?:${names})+(?:\\d+(?:${names})+)*\\d*`;
};

/** A decimal string with its point moved `places` to the right ("1.5", 4 -> "15000"). */
const shifted = (amount: string, places: number): string => {
  const [whole = "", fraction = ""] = amount.split(".");
  const digits = `${whole}${fraction.padEnd(places, "0")}`;
  const [int, rest] = [digits.slice(0, whole.length + places), digits.slice(whole.length + places)];
  return rest === "" ? int : `${int}.${rest}`;
};

const fractionOf = (amount: string): string => amount.split(".")[1] ?? "";

/** The sum of two decimal strings, every decimal place kept, no trailing zeros. */
const added = (a: string, b: string): string => {
  const places = Math.max(fractionOf(a).length, fractionOf(b).length);
  const [x, y] = [a, b].map((d) => BigInt(shifted(d, places).split(".")[0] ?? "0"));
  const sum = ((x ?? 0n) + (y ?? 0n)).toString().padStart(places + 1, "0");
  if (places === 0) return sum;
  return `${sum.slice(0, -places)}.${sum.slice(-places)}`.replace(/\.?0+$/u, "");
};

interface Sum {
  readonly total: string;
  readonly current: string;
}

/** One part of a chain: a multiplier scales the current numeral, a numeral starts a new one. */
const step = (sum: Sum, part: string, table: Readonly<Record<string, number>>): Sum => {
  const factor = table[part];
  if (factor === undefined) return { total: added(sum.total, sum.current), current: part };
  return { total: sum.total, current: shifted(sum.current, String(factor).length - 1) };
};

/** An amount and the multiplier chain written after it, as one number ("1", "\u4e07": "10000"). */
export const multiplied = (
  amount: string,
  written: string | undefined,
  locale: LocaleRule,
  rules: Rules,
): string => {
  const table = tableOf(locale, rules);
  const parts = written?.match(new RegExp(`\\d+|${multiplierNames(locale, rules)}`, "gu")) ?? [];
  const sum = parts.reduce((acc, part) => step(acc, part, table), { total: "0", current: amount });
  return added(sum.total, sum.current);
};
