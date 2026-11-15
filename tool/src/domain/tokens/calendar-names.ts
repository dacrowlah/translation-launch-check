import type { CalendarEntry, LocaleRule, Rules } from "../rules";
import { listOf } from "./per-language";
import { alternation } from "./regex";

export type Entries = readonly CalendarEntry[];

export const fullNames = (entries: Entries): string[] => entries.flatMap((e) => e.full);

export const allNames = (entries: Entries): string[] =>
  entries.flatMap((e) => [...e.full, ...e.short]);

/** Every name and short form of the language's weekdays, as one alternation. */
export const weekdayNames = (locale: LocaleRule, rules: Rules): string =>
  alternation(allNames(listOf(rules.calendar.weekdays, locale)));

/** The words or signs between the days of a date range, as one alternation. */
export const rangeConnectors = (locale: LocaleRule, rules: Rules): string =>
  alternation(listOf(rules.date_range_connectors, locale));
