import type { CheckResult } from "../types";
import { nextOccurrence, weekdayOf } from "../tokens/calendar";
import type { DateToken } from "../tokens/dates";
import { escape } from "../tokens/regex";
import { tokenize, type Tokens } from "../tokens/tokenize";
import {
  diffRows,
  type LinePair,
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
const label = (date: DateToken, weekday = date.weekday): string =>
  `${date.month}/${date.day}${weekday === null ? "" : ` ${name(weekday)}`}`;

const termPattern = (term: string): string =>
  term
    .split(/[\s-]+/u)
    .map(escape)
    .join("[\\s-]");

/** A term's words may be joined by a space, hyphen or no-break space ("Black-Friday"). */
const termsPattern = (terms: readonly string[]): RegExp =>
  new RegExp(terms.length === 0 ? "(?!)" : terms.map(termPattern).join("|"), "giu");

/** Do-not-translate terms ("Black Friday") hold weekday names that are not dates. */
const tokensOf = (text: string, locale: string, ctx: LocaleContext): Tokens => {
  const terms = termsPattern(
    [...ctx.rules.glossary.do_not_translate].sort((x, y) => y.length - x.length),
  );
  return tokenize(text.replace(terms, " "), locale, ctx.rules);
};

const labels = (tokens: Tokens): string[] => [
  ...tokens.dates.map((d) => label(d)),
  ...tokens.weekdays.map(name),
];

const pad = (n: number): string => String(n).padStart(2, "0");

const isoOf = (date: DateToken, today: string): string | null => {
  if (date.year === null) return nextOccurrence(date.month, date.day, today);
  const real = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDate() === date.day;
  return real ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : null;
};

const mismatch = (date: DateToken, today: string): Row[] => {
  const iso = isoOf(date, today);
  const real = iso === null ? date.weekday : weekdayOf(iso);
  return real === date.weekday || real === null ? [] : [[label(date, real), label(date)]];
};

const hasWeekday = (tokens: Tokens): boolean => tokens.dates.some((d) => d.weekday !== null);

const days = (tokens: Tokens): string[] => [
  ...tokens.dates.flatMap((d) => (d.weekday === null ? [] : [name(d.weekday)])),
  ...tokens.weekdays.map(name),
];
const monthDays = (tokens: Tokens): string[] => tokens.dates.map((d) => `${d.month}/${d.day}`);

const differ = (a: readonly string[], b: readonly string[]): boolean => diffRows(a, b).length > 0;

/** Dates differ, or the master names weekdays and the translation's differ. */
const datesDiffer = (m: Tokens, t: Tokens): boolean =>
  differ(monthDays(m), monthDays(t)) || (days(m).length > 0 && differ(days(m), days(t)));

const sides = (pair: LinePair, ctx: LocaleContext): [Tokens, Tokens] => [
  tokensOf(pair.masterText, ctx.rules.master_locale, ctx),
  tokensOf(pair.targetText, pair.locale, ctx),
];

const datesResult = (m: Tokens, t: Tokens, ctx: LocaleContext): CheckResult => {
  const [a, b] = [labels(m), labels(t)];
  const rows = datesDiffer(m, t) ? diffRows(a, b) : [];
  return resultOf(ctx.rules, DATES, a.length + b.length > 0, rows);
};

const weekdayResult = (m: Tokens, t: Tokens, ctx: LocaleContext): CheckResult => {
  const rows = t.dates
    .filter((d) => d.weekday !== null)
    .flatMap((date) => mismatch(date, ctx.today));
  return resultOf(ctx.rules, WEEKDAY, hasWeekday(m) || hasWeekday(t), rows);
};

export const checkDates: MultiCheck = (pair, ctx) => {
  const [m, t] = sides(pair, ctx);
  return { dates: datesResult(m, t, ctx), weekday_date_match: weekdayResult(m, t, ctx) };
};
