import type { LocaleRule, Rules, TwelveOClock } from "../rules";
import { endOf, noonEnd, startOf } from "./clock-halves";
import { clockOf, secondReading } from "./clock-values";
import { compile } from "./compiled";
import { extractNumbers } from "./numbers";
import { nameKey } from "./per-language";
import type { ClockPatterns } from "./time-patterns";
import { takeParts, type Groups, type Part } from "./take";

/** A time that counts only if the other side of the line holds a time ("21 h", "midnight"). */
export interface Candidate {
  readonly time: string;
  /** What it is when it stays no time: its number ("24" in "en 24 h", "9.5"), or nothing. */
  readonly numbers: readonly string[];
}
/** A clock value as read: a definite time, or a candidate, with what it is when no time. */
export interface Placed {
  readonly time: string;
  readonly candidate: boolean;
  readonly numbers: readonly string[];
}
/**
 * Clock values that differ under the language's two readings of 12 o'clock (\u5348\u5f8c12\u6642,
 * or both ends of \u5348\u524d12\u6642\uff5e6\u6642): the default reading's values first.
 */
export interface Twelve {
  readonly readings: readonly [readonly Placed[], readonly Placed[]];
}
interface Found {
  readonly times: readonly string[];
  readonly candidates: readonly Candidate[];
  readonly twelves: readonly Twelve[];
}
/** The clock patterns, and how the locale reads a range start that stays a number. */
interface Context {
  readonly clock: ClockPatterns;
  readonly numbersIn: (text: string) => string[];
}
type Values = readonly Placed[] | null;

/** Definite values become times, the others candidates (in text order). */
export const placed = (values: readonly Placed[]): Pick<Found, "times" | "candidates"> => ({
  times: values.filter((v) => !v.candidate).map((v) => v.time),
  candidates: values.filter((v) => v.candidate).map(({ time, numbers }) => ({ time, numbers })),
});

const valueOf = (g: Groups, twelve: TwelveOClock, candidate: boolean, numbers: string[]) => {
  const time = clockOf(g, twelve);
  return time === null ? null : { time, candidate, numbers };
};

const twelvesOf = (readings: Twelve["readings"]): Twelve[] =>
  readings[0].length === 0 ? [] : [{ readings }];

/** Where both readings agree a value is plain; the values that differ form one twelve. */
const split = (first: readonly Placed[], second: readonly Placed[]): Found => {
  const agree = first.map((v, i) => v.time === second[i]?.time);
  const differ = (values: readonly Placed[]) => values.filter((_v, i) => !agree[i]);
  const plain = placed(first.filter((_v, i) => agree[i]));
  return { ...plain, twelves: twelvesOf([differ(first), differ(second)]) };
};

/** The values under the language's rule for 12 o'clock and, if it has one, its second. */
const underEach = (valuesUnder: (twelve: TwelveOClock) => Values, twelve: TwelveOClock) => {
  const [first, other] = [valuesUnder(twelve), secondReading(twelve)];
  return first === null ? null : split(first, (other && valuesUnder(other)) ?? first);
};

const definiteRange = (g: Groups): boolean =>
  g.cand === undefined || (g.bare0 === undefined && g.cand0 === undefined);

/** A bare start stays the number it is written as ("9.50" in de-CH is 9.5). */
const startNumbers = (g: Groups, c: Context): string[] =>
  g.n0 === undefined ? [g.h0 ?? ""] : c.numbersIn(g.n0);

const rangeUnder = (g: Groups, c: Context, twelve: TwelveOClock): Values => {
  const [h, candidate] = [noonEnd(g, twelve), !definiteRange(g)];
  const start = valueOf(startOf(h, twelve), twelve, candidate, startNumbers(g, c));
  const end = valueOf(endOf(h, twelve), twelve, candidate, [g.h ?? ""]);
  return start === null || end === null ? null : [start, end];
};

const oneOf = (g: Groups, twelve: TwelveOClock): Found | null =>
  underEach((t) => {
    const value = valueOf(g, t, g.cand !== undefined, [g.h ?? ""]);
    return value === null ? null : [value];
  }, twelve);

const wordOf = (g: Groups, clock: ClockPatterns): Found | null => {
  const time = clock.words.get(nameKey(g.w ?? ""));
  const numbers = g.wh === undefined ? [] : [g.wh];
  if (time === undefined) return null;
  return { ...placed([{ time, candidate: true, numbers }]), twelves: [] };
};

/** A range whose start is no time ("ab 50 bis 14 Uhr"): its end alone, from `endAt` on. */
const endAlone = (m: RegExpExecArray, c: Context): Part<Found> | null => {
  const from = (m.indices?.groups?.endAt?.[0] ?? m.index) - m.index;
  const found = from === 0 ? null : oneOf(m.groups ?? {}, c.clock.twelve);
  return found === null ? null : { item: found, from, length: m[0].length - from };
};

const read = (g: Groups, c: Context): Found | null => {
  if (g.w !== undefined) return wordOf(g, c.clock);
  if (g.h0 === undefined) return oneOf(g, c.clock.twelve);
  return underEach((twelve) => rangeUnder(g, c, twelve), c.clock.twelve);
};

const partOf = (m: RegExpExecArray, c: Context): Part<Found> | null => {
  const found = read(m.groups ?? {}, c);
  if (found !== null) return { item: found, length: m[0].length };
  return m.groups?.h0 === undefined ? null : endAlone(m, c);
};

const joined = (
  items: readonly Found[],
): { times: string[]; candidates: Candidate[]; twelves: Twelve[] } => ({
  times: items.flatMap((f) => f.times),
  candidates: items.flatMap((f) => f.candidates),
  twelves: items.flatMap((f) => f.twelves),
});

/** Finds definite clock times, candidates and two-way twelves, as "HH:MM". */
export const extractTimes = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { times: string[]; candidates: Candidate[]; twelves: Twelve[]; rest: string } => {
  const numbersIn = (raw: string) => extractNumbers(raw, locale, rules).numbers;
  const context = { clock: compile(locale, rules).clock, numbersIn };
  const { items, rest } = takeParts(text, context.clock.time, (m) => partOf(m, context));
  return { ...joined(items), rest };
};
