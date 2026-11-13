import type { LocaleRule, Rules } from "../rules";
import { normalizeNumber, numberPattern } from "./numbers";
import { alternation } from "./regex";

/** minor = amount * 100 as an integer (JPY too); currency is the ISO code. */
export interface Money {
  readonly minor: number;
  readonly currency: string;
}

const GAP = "[ \\u00a0\\u202f]?";

const pattern = (locale: LocaleRule, rules: Rules): RegExp => {
  const [cur, amount] = [alternation(Object.keys(rules.currencies)), numberPattern(locale, true)];
  const before = `(?<![\\p{L}])(?<c>${cur})(?!\\p{L})${GAP}(?<a>${amount})`;
  const after = `(?<!\\d)(?<a>${amount})${GAP}(?<c>${cur})(?!\\p{L})`;
  return new RegExp(`${before}|${after}`, "gu");
};

/** "1299.5" becomes 129950: the digits are joined, never multiplied. */
const toMinor = (amount: string): number => {
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole + fraction.padEnd(2, "0").slice(0, 2));
};

const isoOf = (symbol: string, rules: Rules): string =>
  Object.entries(rules.currencies).find(([key]) => key.normalize("NFKC") === symbol)?.[1] ?? symbol;

const moneyOf = (g: Record<string, string>, locale: LocaleRule, rules: Rules): Money => ({
  minor: toMinor(normalizeNumber(g.a ?? "", locale)),
  currency: isoOf(g.c ?? "", rules),
});

/** Finds a currency symbol or code next to an amount; each price becomes one space in rest. */
export const extractMoney = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { money: Money[]; rest: string } => {
  const money: Money[] = [];
  const rest = text.replace(pattern(locale, rules), (...args) => {
    money.push(moneyOf(args.at(-1) as Record<string, string>, locale, rules));
    return " ";
  });
  return { money, rest };
};
