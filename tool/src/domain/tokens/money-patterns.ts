import type { LocaleRule, Rules } from "../rules";
import { currencyNames } from "./currency";
import { bareChain, multiplierChain, multiplierNames } from "./multipliers";
import { numberPattern, percentSource, rangeLink, spacedSource } from "./number-patterns";
import { LATIN, SPACE } from "./regex";
import { currencyAhead } from "./weekday-currency";

const GAP = `${SPACE}?`;

/** Amounts with a dash for no cents ("50,\u2013"); a plain space groups digits only as said. */
const withDecimals = (locale: LocaleRule): string =>
  numberPattern(locale, { dash: true, space: true, fraction: true });
export const plainAmount = (locale: LocaleRule): string => numberPattern(locale, { dash: true });

/**
 * A whole amount, never cut short to dodge what follows: the lookahead takes all its digits, so
 * a failed range is tried once per position, not once per digit (linear time).
 */
const whole = (group: string, amount: string): string => `(?=(?<${group}>${amount}))\\k<${group}>`;

/** An amount and its optional multiplier chain, as `a`/`x` plus the end's number ("", "0", "2"). */
const chained = (end: string, amount: string, chain: string): string =>
  `(?<a${end}>${amount})(?<x${end}>${chain})?`;

/** What joins the ends of a range: the percent-range connectors, in any case ("Zwischen"). */
export const link = (locale: LocaleRule, rules: Rules): string =>
  `(?i:${rangeLink(locale, rules)})`;

/**
 * After a currency: an amount with decimals ("\u20ac 1 299,00"), a plain-space group the pair
 * decides (`sp`: "\u20ac 2 000"; never "$20 100%"), or a plain amount; each may carry a
 * multiplier chain ("\u00a51\u4e07").
 */
const leadAmount = (locale: LocaleRule, rules: Rules): string => {
  const chain = multiplierChain(locale, rules);
  const grouped = `(?<sp>${spacedSource(locale)})(?!${percentSource(locale, rules)})`;
  return `(?:${chained("", withDecimals(locale), chain)}|${grouped}|${chained("", plainAmount(locale), chain)})`;
};

/**
 * The end of a range the currency before it covers ("\u00a510,000-30,000"), as `e2` with its
 * connector; never a percentage.
 */
const priceRangeEnd = (locale: LocaleRule, rules: Rules): string => {
  const end = whole("r2", chained("2", plainAmount(locale), multiplierChain(locale, rules)));
  return `(?<e2>${link(locale, rules)}${end}(?!${percentSource(locale, rules)}))?`;
};

/**
 * The start of a range the currency after it covers ("10\u201330 \u20ac", "1\u4e07\uff5e3\u4e07\u5186"),
 * as `s0` with its connector.
 */
const priceRangeStart = (locale: LocaleRule, rules: Rules): string => {
  const start = whole("r0", chained("0", plainAmount(locale), multiplierChain(locale, rules)));
  return `(?<s0>${start}${link(locale, rules)})?`;
};

/**
 * A currency before or after an amount, never inside a Latin word (kana may touch it). Before a
 * currency a chain alone is one times the chain ("\u5343\u5186"). A suffix amount never starts
 * inside a chain (after a numeral or a multiplier). A Latin letter next to a currency that is
 * no Latin word itself is copy ("1,000\u5186OFF", "SALE\u00a5500"). A currency written once on a
 * range covers both ends.
 */
const leadSource = (locale: LocaleRule, rules: Rules, cur: string): string => {
  const ahead = currencyAhead(locale, rules);
  const notLatinWord = `(?:(?<!${LATIN})|(?!${LATIN}))`;
  const amount = `${leadAmount(locale, rules)}${priceRangeEnd(locale, rules)}`;
  return `${ahead}${notLatinWord}(?<c>${cur})(?!${LATIN})${GAP}${amount}`;
};

/** Before a currency a plain space groups digits ("1 299 \u20ac"); never "$20 100%". */
const suffixAmount = (locale: LocaleRule, rules: Rules): string => {
  const after = numberPattern(locale, { dash: true, space: true });
  return `(?:${chained("", after, multiplierChain(locale, rules))}|(?<x>${bareChain(locale, rules)}))`;
};

const suffixSource = (locale: LocaleRule, rules: Rules, cur: string): string => {
  const start = `(?<!\\d|${multiplierNames(locale, rules)})${priceRangeStart(locale, rules)}`;
  return `${start}${suffixAmount(locale, rules)}${GAP}(?<c>${cur})(?!(?<=${LATIN})${LATIN})`;
};

/** A price: a currency with its amount before or after it. */
export const moneySource = (locale: LocaleRule, rules: Rules): string => {
  const cur = currencyNames(locale, rules);
  return `${leadSource(locale, rules, cur)}|${suffixSource(locale, rules, cur)}`;
};
