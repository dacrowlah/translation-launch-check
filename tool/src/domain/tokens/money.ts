import type { LocaleRule, Rules } from "../rules.js";
import { compile } from "./compiled.js";
import { currencyCodeOf } from "./currency.js";
import { plainParts, readAmount } from "./number-patterns.js";
import { rangeOf, type Numeral, type Pricer } from "./price-ranges.js";
import { takeParts, type Groups, type Part } from "./take.js";

/** amount: the normalized decimal string ("1299.5", every decimal place kept); currency: ISO. */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/**
 * "\u20ac 2 000": the whole price, or the first part as the price and the rest as numbers, as the
 * other side of the line decides (resolvePair).
 */
export interface SpacedMoney {
  readonly whole: Money;
  readonly first: Money;
  readonly rest: readonly string[];
}

interface Found {
  readonly money: Money[];
  readonly spacedMoney: SpacedMoney[];
}

/** The price of a match (or a plain-space group's whole), for comparing it with a range end. */
interface Main {
  readonly found: Found;
  readonly price: Money;
}

const pricerOf = (g: Groups, locale: LocaleRule, rules: Rules): Pricer => {
  const currency = currencyCodeOf(g.c ?? "", locale, rules);
  return (raw, chain) => ({ amount: readAmount(raw, chain, locale, rules), currency });
};

const numeralOf =
  (locale: LocaleRule, rules: Rules): Numeral =>
  (raw) =>
    Number(readAmount(raw, undefined, locale, rules));

const spacedOf = (raw: string, price: Pricer, locale: LocaleRule, rules: Rules): SpacedMoney => {
  const [first = "", ...rest] = plainParts(raw);
  const parts = rest.map((p) => readAmount(p, undefined, locale, rules));
  return { whole: price(raw), first: price(first), rest: parts };
};

/** A missing amount ("\u5343\u5186": a chain alone) counts as one. */
const plainMain = (g: Groups, price: Pricer): Main => {
  const main = price(g.a ?? "1", g.x);
  return { found: { money: [main], spacedMoney: [] }, price: main };
};

const mainOf = (g: Groups, price: Pricer, locale: LocaleRule, rules: Rules): Main => {
  if (g.sp === undefined) return plainMain(g, price);
  const spaced = spacedOf(g.sp, price, locale, rules);
  return { found: { money: [], spacedMoney: [spaced] }, price: spaced.whole };
};

/** One match: a range start, the price or a plain-space group, and a range end. */
const partOf = (m: RegExpExecArray, locale: LocaleRule, rules: Rules): Part<Found> => {
  const price = pricerOf(m.groups ?? {}, locale, rules);
  const main = mainOf(m.groups ?? {}, price, locale, rules);
  const { start, end, from, length } = rangeOf(m, price, main.price, numeralOf(locale, rules));
  const money = [...start, ...main.found.money, ...end];
  return { item: { money, spacedMoney: main.found.spacedMoney }, from, length };
};

const joined = (items: readonly Found[]): Found => ({
  money: items.flatMap((f) => f.money),
  spacedMoney: items.flatMap((f) => f.spacedMoney),
});

/** Finds a currency symbol or code next to an amount; each price becomes one space in rest. */
export const extractMoney = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): Found & { rest: string } => {
  const read = (m: RegExpExecArray) => partOf(m, locale, rules);
  const { items, rest } = takeParts(text, compile(locale, rules).money, read);
  return { ...joined(items), rest };
};
