import type { LocaleRule } from "../rules.js";
import type { CalendarPatterns } from "./date-patterns.js";
import type { DateToken, Slash } from "./dates.js";
import { nameKey } from "./per-language.js";
import type { Groups, Part } from "./take.js";

export type Order = NonNullable<LocaleRule["date_order"]>;

/** The order a locale writes n/n dates in; day first unless the rules say otherwise. */
export const orderOf = (locale: LocaleRule): Order => locale.date_order ?? "dmy";

export interface Piece {
  readonly dates: readonly DateToken[];
  readonly slashes: readonly Slash[];
}

const number = (text: string | undefined): number => Number(text);

const ordered = (a: number, b: number, order: Order): [number, number] =>
  order === "mdy" ? [a, b] : [b, a];

const named = (table: ReadonlyMap<string, number>, name: string | undefined): number | null =>
  table.get(nameKey(name ?? "")) ?? null;

/** The weekday a name stands for (0 = Monday), or null. */
export const weekdayNamed = (name: string | undefined, calendar: CalendarPatterns): number | null =>
  named(calendar.weekdays, name);

const monthAndDay = (g: Groups, calendar: CalendarPatterns, order: Order): [number, number] => {
  if (g.n1 === undefined) return [named(calendar.months, g.mn) ?? number(g.mi), number(g.d)];
  return ordered(number(g.n1), number(g.n2), order);
};

const real = (month: number, day: number): boolean =>
  month >= 1 && month <= 12 && day >= 1 && day <= 31;

const dateOf = (month: number, day: number, year: number | null, weekday: number | null) =>
  real(month, day) ? { month, day, year, weekday } : null;

const toDate = (g: Groups, calendar: CalendarPatterns, order: Order): DateToken | null => {
  const [month, day] = monthAndDay(g, calendar, order);
  const year = g.y === undefined ? null : number(g.y);
  return dateOf(month, day, year, weekdayNamed(g.wd ?? g.ws, calendar));
};

const slashOf = (g: Groups, calendar: CalendarPatterns, order: Order): Slash => {
  const [month, day] = ordered(number(g.s1), number(g.s2), order);
  const weekday = weekdayNamed(g.wd ?? g.ws, calendar);
  return { numbers: [g.s1 ?? "", g.s2 ?? ""], date: dateOf(month, day, null, weekday), weekday };
};

const firstDay = (g: Groups, last: DateToken, calendar: CalendarPatterns): DateToken | null =>
  dateOf(last.month, number(g.d0), last.year, weekdayNamed(g.wd, calendar));

/** The last day takes a weekday written after it, before it ("So., 29."), or "Sat-Sun"'s second. */
const rangeOf = (g: Groups, last: DateToken, calendar: CalendarPatterns): DateToken[] | null => {
  const first = firstDay(g, last, calendar);
  const lastDay = { ...last, weekday: weekdayNamed(g.ws ?? g.wl ?? g.w2, calendar) };
  return first !== null && first.day < last.day ? [first, lastDay] : null;
};

const piece = (dates: readonly DateToken[], slashes: readonly Slash[] = []): Piece => ({
  dates,
  slashes,
});

/**
 * "Nov 27 - 7 days" is no range. Where the first date is whole on its own (it ends at the
 * template's {first_end}), that date is taken, with its weekday; the rest stays text.
 */
const firstOnly = (m: RegExpExecArray, last: DateToken, calendar: CalendarPatterns) => {
  const end = m.indices?.groups?.fe;
  const first = firstDay(m.groups ?? {}, last, calendar);
  return end === undefined || first === null
    ? null
    : { item: piece([first]), length: end[0] - m.index };
};

/** A clock time after the first day ("27\u65e5(\u91d1)0\u6642\uff5e") stays for the times stage. */
const whole = (m: RegExpExecArray, dates: readonly DateToken[]): Part<Piece> => {
  const time = m.groups?.ft;
  const keep = time === undefined ? {} : { keep: ` ${time} ` };
  return { item: piece(dates), length: m[0].length, ...keep };
};

const dated = (m: RegExpExecArray, date: DateToken, calendar: CalendarPatterns) => {
  if (m.groups?.d0 === undefined) return whole(m, [date]);
  const range = rangeOf(m.groups, date, calendar);
  return range === null ? firstOnly(m, date, calendar) : whole(m, range);
};

/** One match as dates (a range as two), a yearless slash form, or nothing. */
export const pieceOf = (
  m: RegExpExecArray,
  calendar: CalendarPatterns,
  order: Order,
): Part<Piece> | null => {
  const g: Groups = m.groups ?? {};
  if (g.s1 !== undefined)
    return { item: piece([], [slashOf(g, calendar, order)]), length: m[0].length };
  const date = toDate(g, calendar, order);
  return date === null ? null : dated(m, date, calendar);
};
