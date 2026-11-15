import type { LocaleRule, Rules } from "../rules";
import { rangeConnectors, weekdayNames } from "./calendar-names";
import { anyClock, hourMinutes, minuteSeparator, timeConnectorList } from "./clock-formats";
import { currenciesOf, currencyNames, namesSource } from "./currency";
import { listOf } from "./per-language";
import { alternation, SPACE } from "./regex";

/** Currencies written like a short weekday of the language ("Fr." in de-CH is also Friday). */
const weekdayLike = (locale: LocaleRule, rules: Rules): string[] => {
  const shorts = new Set(listOf(rules.calendar.weekdays, locale).flatMap((day) => day.short));
  return Object.keys(currenciesOf(locale, rules)).filter((n) => shorts.has(n.replace(/\.$/u, "")));
};

/** The end of a weekday range ("Mo.\u2013"): a "Fr." after it is Friday, never francs. */
const weekdayRangeBefore = (locale: LocaleRule, rules: Rules): string =>
  `(?<!(?:${weekdayNames(locale, rules)})\\.?\\s*(?:${rangeConnectors(locale, rules)})\\s*)`;

/** The language's range connectors without letters ("-") or with them ("bis"). */
const connectors = (locale: LocaleRule, rules: Rules, words: boolean): string =>
  alternation(timeConnectorList(locale, rules).filter((c) => /\p{L}/u.test(c) === words));

/** "8.30 bis " before "18.30": a time with minutes, a word connector, then such a time. */
const minutesBefore = (word: string, timed: string): string =>
  `${timed}\\s+(?:${word})\\s+(?=${timed})`;

/**
 * Hours before the clock time that ends a range: "9\u2013", "9 bis ", or "8.30 bis " before
 * "18.30". "Fr." before split hours ("Fr. 9\u201312, 14\u201318 Uhr") stays francs: a price range
 * before hours ("Fr. 10.50\u201312.50, 14\u201318 Uhr") has the same shape.
 */
const hoursBefore = (locale: LocaleRule, rules: Rules): string => {
  const [dash, word] = [connectors(locale, rules, false), connectors(locale, rules, true)];
  const separator = minuteSeparator(locale, rules);
  const dashed = `${hourMinutes(separator)}\\s*(?:${dash})\\s*`;
  const minutes = minutesBefore(word, hourMinutes(separator, { required: true }));
  return `(?:${dashed}|\\d{1,2}\\s+(?:${word})\\s+|${minutes})?`;
};

/** A clock time, or hours ending in one ("20 Uhr", "9\u201318 Uhr", "9 bis 18 Uhr"). */
const clockAhead = (locale: LocaleRule, rules: Rules): string =>
  `${SPACE}?${hoursBefore(locale, rules)}(?:${anyClock(locale, rules)})`;

/** A weekday-like currency before a clock time ("Fr. 20 Uhr") or after a weekday range. */
const weekdayGuard = (locale: LocaleRule, rules: Rules, weekdays: string): string => {
  const asWeekday = `(?!(?:${weekdays})${clockAhead(locale, rules)})`;
  return `(?:(?!${weekdays})|${asWeekday}${weekdayRangeBefore(locale, rules)})`;
};

/**
 * Where a currency starts, unless it is a weekday-like one used as the weekday: before a clock
 * time or after a weekday range. The currency is tested first, so the look-behind runs only
 * where a currency starts (linear time).
 */
export const currencyAhead = (locale: LocaleRule, rules: Rules): string => {
  const weekdays = weekdayLike(locale, rules);
  const ahead = `(?=${currencyNames(locale, rules)})`;
  if (weekdays.length === 0) return ahead;
  return `${ahead}${weekdayGuard(locale, rules, namesSource(weekdays))}`;
};
