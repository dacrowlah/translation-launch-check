import type { LocaleRule, Rules } from "../rules.js";
import { allNames, weekdayNames } from "./calendar-names.js";
import { noPrefixCurrency } from "./price-guards.js";
import { listOf } from "./per-language.js";
import { alternation, anyOfSources } from "./regex.js";

/** A day or month number, one or two digits, as `group`. */
export const dayOrMonth = (group: string): string => String.raw`(?<${group}>\d{1,2})`;
/** No more slash parts or digits after a slash form ("11/27", never "11/27/2026"'s start). */
export const SLASH_END = String.raw`(?![/\d])`;
export const DAY = String.raw`${dayOrMonth("d")}(?!\d)`;
export const YEAR = String.raw`(?<y>(?:19|20)\d\d)(?!\d)`;
/** What may follow a weekday before its date: an optional dot and comma, then a space. */
export const WEEKDAY_END = String.raw`(?!\p{L})\.?,?\s+`;
/** n/n with a day and month in the locale's order (n1, n2). */
export const NUMBERED = String.raw`${dayOrMonth("n1")}/${dayOrMonth("n2")}`;
const SLASHED = String.raw`${NUMBERED}/${YEAR}${SLASH_END}`;
const DOTTED = String.raw`${dayOrMonth("n1")}\.${dayOrMonth("n2")}\.(?:\s?${YEAR})?(?!\d)`;
/** Year first is year/month/day in every locale; a yearless n/n is resolved by the pair. */
const YEAR_FIRST = String.raw`${YEAR}/${dayOrMonth("mi")}/${DAY}${SLASH_END}`;
/**
 * Never the decimal part of a rating ("4.5/5", "4,75/5": a one-digit number, "." or ",", then
 * the slash form); after a list comma ("11/27,11/29") or a full stop it may be.
 */
const NOT_A_RATING = String.raw`(?<!(?<!\d)\d[.,])(?<![\d/])`;
const SLASH = String.raw`${NOT_A_RATING}${dayOrMonth("s1")}/${dayOrMonth("s2")}${SLASH_END}`;
export const SLASHES = [SLASHED, YEAR_FIRST, SLASH];

/** A {place} of a date template; group 1 is its name. */
export const PLACE = /\{([a-z_]+)\}/gu;

/** A template with its {places} filled in; an unknown place is left as written. */
export const fill = (template: string, places: Readonly<Record<string, string>>): string =>
  template.replace(PLACE, (all, name: string) => places[name] ?? all);

/** Places that are the same in every language. */
const FIXED_PLACES: Readonly<Record<string, string>> = {
  month_number: dayOrMonth("mi"),
  day: DAY,
  year: YEAR,
};

/** The places every date template may use: {month} {month_number} {day} {ordinal} {year}. */
export const placesOf = (locale: LocaleRule, rules: Rules): Record<string, string> => ({
  ...FIXED_PLACES,
  month: `(?<mn>${alternation(allNames(listOf(rules.calendar.months, locale)))})(?!\\p{L})`,
  ordinal: `(?:${alternation(listOf(rules.calendar.ordinals, locale))})?`,
});

/** Dotted dates ("29.11."); where "." is the decimal, never a currency's amount ("Fr. 12.10."). */
export const dotted = (locale: LocaleRule, rules: Rules): string[] => {
  const guard = locale.decimal === "." ? noPrefixCurrency(locale, rules) : "";
  return locale.dotted_dates === true ? [`${guard}${DOTTED}`] : [];
};

export const written = (locale: LocaleRule, rules: Rules): string[] =>
  listOf(rules.calendar.date_forms, locale).map((t) => fill(t, placesOf(locale, rules)));

/** A weekday after its date ("(\u65e5)"), as `group`; null if the language puts it first. */
export const weekdayAfter = (locale: LocaleRule, rules: Rules, group: string): string | null => {
  const templates = listOf(rules.calendar.weekday_after, locale);
  const name = `(?<${group}>${weekdayNames(locale, rules)})`;
  return templates.length === 0 ? null : anyOfSources(templates.map((t) => fill(t, { name })));
};
