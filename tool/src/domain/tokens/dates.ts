import type { LocaleRule, Rules } from "../rules.js";
import { compile } from "./compiled.js";
import type { CalendarPatterns } from "./date-patterns.js";
import { orderOf, pieceOf, weekdayNamed, type Piece } from "./date-reader.js";
import { takeParts, type Part } from "./take.js";

/** weekday: 0 = Monday, or null when the text names none next to the date. */
export interface DateToken {
  readonly month: number;
  readonly day: number;
  readonly year: number | null;
  readonly weekday: number | null;
}

/** A yearless n/n: a date or two numbers, decided by the other side of the line (resolvePair). */
export interface Slash {
  readonly numbers: readonly string[];
  /** Read in the locale's own order; null when that is no month and day. */
  readonly date: DateToken | null;
  readonly weekday: number | null;
}

/** Finds dates (ranges as two) with an adjacent weekday, and yearless slash forms to resolve. */
export const extractDates = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { dates: DateToken[]; slashes: Slash[]; rest: string } => {
  const { calendar } = compile(locale, rules);
  const read = (m: RegExpExecArray): Part<Piece> | null => pieceOf(m, calendar, orderOf(locale));
  const { items, rest } = takeParts(text, calendar.date, read);
  return { dates: items.flatMap((p) => p.dates), slashes: items.flatMap((p) => p.slashes), rest };
};

const weekdaysIn = (text: string, calendar: CalendarPatterns): number[] =>
  [...text.matchAll(calendar.bare)].flatMap((m) => weekdayNamed(m.groups?.w, calendar) ?? []);

/** Finds weekday names standing alone: full names only, never a short form like "So" or "Do". */
export const extractWeekdays = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { weekdays: number[]; rest: string } => {
  const { calendar } = compile(locale, rules);
  return { weekdays: weekdaysIn(text, calendar), rest: text.replace(calendar.bare, " ") };
};
