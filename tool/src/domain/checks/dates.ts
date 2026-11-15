import type { CheckResult } from "../types";
import { isoDate, nextOccurrence, weekdayOf } from "../tokens/calendar";
import type { DateToken } from "../tokens/dates";
import type { Tokens } from "../tokens/tokenize";
import {
  diffRows,
  resultOf,
  type LocaleContext,
  type MultiCheck,
  type Row,
  type Spec,
} from "./compare";

export const DATES_DETAIL = "A date or weekday differs from the master.";
export const WEEKDAY_DETAIL = "The weekday doesn't match the date.";

const DATES: Spec = { check: "dates", detail: DATES_DETAIL };
const WEEKDAY: Spec = { check: "weekday_date_match", detail: WEEKDAY_DETAIL };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const name = (weekday: number): string => DAYS[weekday] ?? "";
const keyOf = (date: DateToken): string => `${date.month}/${date.day}`;
const label = (date: DateToken, weekday = date.weekday): string =>
  `${keyOf(date)}${weekday === null ? "" : ` ${name(weekday)}`}`;

const labels = (tokens: Tokens): string[] => [
  ...tokens.dates.map((d) => label(d)),
  ...tokens.weekdays.map(name),
];

const isoDateOf = (date: DateToken, today: string): string | null =>
  date.year === null
    ? nextOccurrence(date.month, date.day, today)
    : isoDate(date.year, date.month, date.day);

const mismatch = (date: DateToken, today: string): Row[] => {
  const iso = isoDateOf(date, today);
  const real = iso === null ? date.weekday : weekdayOf(iso);
  return real === date.weekday || real === null ? [] : [[label(date, real), label(date)]];
};

const hasWeekday = (tokens: Tokens): boolean => tokens.dates.some((d) => d.weekday !== null);

const days = (tokens: Tokens): string[] => [
  ...tokens.dates.flatMap((d) => (d.weekday === null ? [] : [name(d.weekday)])),
  ...tokens.weekdays.map(name),
];
const monthDays = (tokens: Tokens): string[] => tokens.dates.map(keyOf);

const differ = (a: readonly string[], b: readonly string[]): boolean => diffRows(a, b).length > 0;

/** The month/days the master writes only without a weekday. */
const bareKeys = (m: Tokens): Set<string> => {
  const named = new Set(m.dates.filter((d) => d.weekday !== null).map(keyOf));
  return new Set(m.dates.filter((d) => d.weekday === null && !named.has(keyOf(d))).map(keyOf));
};

/** The target's dates without a weekday that the master's same date does not name. */
const asMaster = (m: Tokens, t: Tokens): Tokens => {
  const bare = bareKeys(m);
  return { ...t, dates: t.dates.map((d) => (bare.has(keyOf(d)) ? { ...d, weekday: null } : d)) };
};

/**
 * Dates differ, or the master names weekdays and the translation's differ. A weekday only the
 * translation adds is for weekday_date_match alone, so an unchanged date is never a row:
 * without a weekday in the master the rows hold month and day only, and with one, a weekday
 * the translation adds to a date the master writes bare is left out.
 */
const rowsOf = (m: Tokens, t: Tokens): Row[] => {
  const [masterDays, target] = [days(m), asMaster(m, t)];
  if (masterDays.length === 0) return diffRows(monthDays(m), monthDays(t));
  const changed = differ(monthDays(m), monthDays(target)) || differ(masterDays, days(target));
  return changed ? diffRows(labels(m), labels(target)) : [];
};

const datesResult = (m: Tokens, t: Tokens, ctx: LocaleContext): CheckResult =>
  resultOf(ctx.rules, DATES, labels(m).length + labels(t).length > 0, rowsOf(m, t));

const weekdayResult = (m: Tokens, t: Tokens, ctx: LocaleContext): CheckResult => {
  const rows = t.dates
    .filter((d) => d.weekday !== null)
    .flatMap((date) => mismatch(date, ctx.today));
  return resultOf(ctx.rules, WEEKDAY, hasWeekday(m) || hasWeekday(t), rows);
};

export const checkDates: MultiCheck = ({ master, target }, ctx) => ({
  dates: datesResult(master, target, ctx),
  weekday_date_match: weekdayResult(master, target, ctx),
});
