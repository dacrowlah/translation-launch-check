import type { LocaleRule, Rules } from "../rules.js";
import {
  DAY,
  dayOrMonth,
  dotted,
  fill,
  NUMBERED,
  placesOf,
  SLASH_END,
  weekdayAfter,
  WEEKDAY_END,
  written,
} from "./date-forms.js";
import { rangeConnectors, weekdayNames } from "./calendar-names.js";
import { orderOf } from "./date-reader.js";
import { listOf } from "./per-language.js";
import { NEVER } from "./regex.js";
import { anyClock, minuteSeparator } from "./clock-formats.js";
import { noClockAhead } from "./time-patterns.js";

/** The last day of a range is no percentage ("Nov 27 - 30%") and no clock time ("11:59"). */
const lastDayEnd = (locale: LocaleRule, rules: Rules): string =>
  String.raw`(?!\s?%|${minuteSeparator(locale, rules)}\d)`;
const DAY_SLASH_MONTH = String.raw`${NUMBERED}${SLASH_END}`;
/** Range forms of every language; each language may add its own in rules (range_forms). */
const MONTH_FIRST = [
  String.raw`{month}\.?\s+{first}{ordinal}{first_end}`,
  String.raw`{to}{last}{ordinal}{end}(?:,?\s+{year})?`,
].join("");
const SLASH_MONTH_FIRST = [
  String.raw`{month_number}/{first}{first_weekday}{first_end}`,
  String.raw`{to}{last}{end}${SLASH_END}`,
].join("");

/** Range places that are the same in every language. */
const FIXED_RANGE_PLACES: Readonly<Record<string, string>> = {
  first: String.raw`${dayOrMonth("d0")}(?!\d)`,
  first_end: "(?<fe>)",
};

/** The places a range template may use, besides those of every date template. */
const rangePlaces = (locale: LocaleRule, rules: Rules): Record<string, string> => ({
  ...placesOf(locale, rules),
  ...FIXED_RANGE_PLACES,
  ...languagePlaces(locale, rules),
  end: lastDayEnd(locale, rules),
});

/** {first_weekday} {first_time} {to} {last}: built from the language's rules (and {end}). */
const languagePlaces = (locale: LocaleRule, rules: Rules): Record<string, string> => ({
  first_weekday: `(?:\\s?(?:${weekdayAfter(locale, rules, "wd") ?? NEVER}))?`,
  first_time: `(?:\\s?(?<ft>${anyClock(locale, rules)}))?`,
  to: `\\s*(?:${rangeConnectors(locale, rules)})\\s*`,
  last: `${noClockAhead(locale, rules)}${DAY}`,
});

/** A weekday before the last day ("Sa., 28. - So., 29. November"). */
const lastWeekday = (locale: LocaleRule, rules: Rules): string =>
  `(?:(?<wl>${weekdayNames(locale, rules)})${WEEKDAY_END})?`;

/** "27. bis 30. November", "du 27 au 30/11": the first day, then a full date. */
const dayFirst = (locale: LocaleRule, rules: Rules): string => {
  const slash = orderOf(locale) === "mdy" ? [] : [DAY_SLASH_MONTH];
  const ends = [...written(locale, rules), ...dotted(locale, rules), ...slash].join("|");
  const head = fill("{first}{ordinal}\\.?{to}", rangePlaces(locale, rules));
  return `${head}${lastWeekday(locale, rules)}(?:${ends})`;
};

const templatesOf = (locale: LocaleRule, rules: Rules): string[] => [
  MONTH_FIRST,
  ...(orderOf(locale) === "mdy" ? [SLASH_MONTH_FIRST] : []),
  ...listOf(rules.calendar.range_forms, locale),
];

/** Every range form of the locale: two dates that share a month (and a year). */
export const rangeForms = (locale: LocaleRule, rules: Rules): string[] => {
  const places = rangePlaces(locale, rules);
  return [...templatesOf(locale, rules).map((t) => fill(t, places)), dayFirst(locale, rules)];
};
