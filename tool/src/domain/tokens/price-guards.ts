import type { LocaleRule, Rules } from "../rules.js";
import { currencyNames } from "./currency.js";
import { link, plainAmount } from "./money-patterns.js";
import { multiplierNames } from "./multipliers.js";
import { SPACE } from "./regex.js";
import { currencyAhead } from "./weekday-currency.js";

/** A currency that may stand before its amount: not a weekday-like one used as the weekday. */
const prefixCurrency = (locale: LocaleRule, rules: Rules): string =>
  `${currencyAhead(locale, rules)}(?:${currencyNames(locale, rules)})`;

/**
 * Nothing here is the amount of a currency written before it ("Heute, CHF 9.50"). A currency
 * right after a numeral or a multiplier, with at most one space between ("1,000\u5186 20\u6642",
 * "1\u4e07\u5186"), belongs to that amount, not to what follows; a comma or full stop alone
 * never makes it a suffix.
 */
export const noPrefixCurrency = (locale: LocaleRule, rules: Rules): string => {
  const amount = `(?:\\d|${multiplierNames(locale, rules)})`;
  return `(?<!(?<!${amount}${SPACE}?)${prefixCurrency(locale, rules)}${SPACE}?)`;
};

/**
 * Nothing here is the end of a price range written after its currency ("CHF 12\u201315 bis 20
 * Uhr": "15" is a price, so "bis 20 Uhr" is no range from 15).
 */
export const noPriceRangeEnd = (locale: LocaleRule, rules: Rules): string =>
  `(?<!${prefixCurrency(locale, rules)}${SPACE}?${plainAmount(locale)}${link(locale, rules)})`;
