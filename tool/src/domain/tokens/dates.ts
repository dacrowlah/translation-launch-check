import type { LocaleRule, Rules } from "../rules";
import { compile, type Compiled } from "./date-patterns";

/** weekday: 0 = Monday, or null when the text names none next to the date. */
export interface DateToken {
  readonly month: number;
  readonly day: number;
  readonly year: number | null;
  readonly weekday: number | null;
}

type Groups = Readonly<Record<string, string | undefined>>;
type Order = "mdy" | "dmy";

const number = (text: string | undefined): number => Number(text);

const monthAndDay = (g: Groups, calendar: Compiled, order: Order): [number, number] => {
  if (g.n1 === undefined)
    return [calendar.months.get(g.mn?.toLowerCase() ?? "") ?? number(g.mi), number(g.d)];
  return order === "mdy" ? [number(g.n1), number(g.n2)] : [number(g.n2), number(g.n1)];
};

const weekdayIn = (g: Groups, calendar: Compiled): number | null =>
  calendar.weekdays.get((g.wd ?? g.ws ?? "").toLowerCase()) ?? null;

const toDate = (g: Groups, calendar: Compiled, order: Order): DateToken | null => {
  const [month, day] = monthAndDay(g, calendar, order);
  const year = g.y === undefined ? null : number(g.y);
  const real = month >= 1 && month <= 12 && day >= 1 && day <= 31;
  return real ? { month, day, year, weekday: weekdayIn(g, calendar) } : null;
};

const orderOf = (locale: LocaleRule): Order => locale.date_order ?? "dmy";

const reader =
  (calendar: Compiled, order: Order, dates: DateToken[]) =>
  (...args: unknown[]): string => {
    const date = toDate(args.at(-1) as Groups, calendar, order);
    if (date) dates.push(date);
    return date ? " " : String(args[0]);
  };

/** Finds dates in the locale's written and numeric forms, with an adjacent weekday. */
export const extractDates = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { dates: DateToken[]; rest: string } => {
  const calendar = compile(locale, rules);
  const dates: DateToken[] = [];
  const rest = text.replace(calendar.date, reader(calendar, orderOf(locale), dates));
  return { dates, rest };
};

const weekdaysIn = (text: string, calendar: Compiled): number[] =>
  [...text.matchAll(calendar.bare)].flatMap(
    (m) => calendar.weekdays.get((m[1] ?? "").toLowerCase()) ?? [],
  );

/** Finds weekday names standing alone: full names only, never a short form like "So" or "Do". */
export const extractWeekdays = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { weekdays: number[]; rest: string } => {
  const calendar = compile(locale, rules);
  return { weekdays: weekdaysIn(text, calendar), rest: text.replace(calendar.bare, " ") };
};
