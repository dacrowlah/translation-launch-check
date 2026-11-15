import type { LocaleRule, Rules } from "../rules";
import { allNames, fullNames, rangeConnectors, weekdayNames, type Entries } from "./calendar-names";
import { dotted, SLASHES, weekdayAfter, WEEKDAY_END, written } from "./date-forms";
import { rangeForms } from "./date-ranges";
import { listOf, nameKey } from "./per-language";
import { alternation } from "./regex";

/** The date and weekday patterns and name tables of one locale. */
export interface CalendarPatterns {
  readonly date: RegExp;
  readonly bare: RegExp;
  readonly months: ReadonlyMap<string, number>;
  readonly weekdays: ReadonlyMap<string, number>;
}

const lookup = (entries: Entries, first: number): Map<string, number> =>
  new Map(entries.flatMap((e, i) => allNames([e]).map((n) => [nameKey(n), i + first])));

/** A date never starts inside a Latin word or a number; kana or kanji may touch it. */
const LEAD = String.raw`(?<![\p{Script=Latin}\d])`;

/** "Sat-Sun, Nov 28-29": a second weekday, given to the last day of the range. */
const secondWeekday = (locale: LocaleRule, rules: Rules): string => {
  const [to, names] = [rangeConnectors(locale, rules), weekdayNames(locale, rules)];
  return String.raw`(?:\.?\s*(?:${to})\s*(?<w2>${names})(?!\p{L}))?`;
};

const articleOf = (locale: LocaleRule, rules: Rules): string =>
  `(?:(?:${alternation(listOf(rules.calendar.articles, locale))})\\s+)?`;

/** A full name may take one article ("Sonntag, den 29."); a short form must touch the date. */
const prefix = (locale: LocaleRule, rules: Rules): string => {
  const days = listOf(rules.calendar.weekdays, locale);
  const end = `${secondWeekday(locale, rules)}${WEEKDAY_END}`;
  const full = `(?<wd>${alternation(fullNames(days))})${end}${articleOf(locale, rules)}`;
  return `(?:${full}|(?<wd>${alternation(days.flatMap((e) => e.short))})${end})?`;
};

/** Ranges first, so a range wins over its first date. */
const dateForms = (locale: LocaleRule, rules: Rules): string => {
  const forms = [...rangeForms(locale, rules), ...written(locale, rules)];
  return [...forms, ...dotted(locale, rules), ...SLASHES].join("|");
};

/** A weekday before the date, or after it where the language writes it there ("(\u65e5)"). */
const dateSource = (locale: LocaleRule, rules: Rules): string => {
  const after = weekdayAfter(locale, rules, "ws");
  const [before, suffix] =
    after === null ? [prefix(locale, rules), ""] : ["", `(?:\\s?(?:${after}))?`];
  return `${LEAD}${before}(?:${dateForms(locale, rules)})${suffix}`;
};

/** A weekday standing alone: a full name only, never a short form like "So" or "Tues". */
const bareSource = (locale: LocaleRule, rules: Rules): string => {
  const days = listOf(rules.calendar.weekdays, locale);
  const full = String.raw`(?<!\p{L})(?<w>${alternation(fullNames(days))})(?!\p{L})`;
  return weekdayAfter(locale, rules, "w") ?? full;
};

export const calendarPatterns = (locale: LocaleRule, rules: Rules): CalendarPatterns => ({
  date: new RegExp(dateSource(locale, rules), "giud"),
  bare: new RegExp(bareSource(locale, rules), "giu"),
  months: lookup(listOf(rules.calendar.months, locale), 1),
  weekdays: lookup(listOf(rules.calendar.weekdays, locale), 0),
});
