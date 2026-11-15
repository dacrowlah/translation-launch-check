import type { DateToken, Slash } from "./dates";
import { resolveCandidates } from "./resolve-candidates";
import { spacedPrices } from "./resolve-money";
import { spacedNumbers } from "./resolve-spaced";
import { withTwelves } from "./resolve-twelves";
import type { Tokens } from "./tokenize";

const key = (date: DateToken): string => `${date.month}/${date.day}`;
const digits = (slash: Slash): string => slash.numbers.join("/");
const slashDates = (side: Tokens): DateToken[] => side.slashes.flatMap((s) => s.date ?? []);
const keysOf = (dates: readonly DateToken[]): Set<string> => new Set(dates.map(key));

/** What one side needs to know about the other, computed once per side (linear). */
interface View {
  /** (a): month/day pairs the other side holds, its slash forms read in its own order. */
  readonly seen: ReadonlySet<string>;
  /** Slash forms written the same on both sides resolve together, never by rule (b). */
  readonly twins: ReadonlySet<string>;
  /** (b): how many dates the other side holds that this side lacks. */
  readonly room: number;
}

const viewOf = (side: Tokens, other: Tokens): View => {
  const seen = keysOf([...other.dates, ...slashDates(other)]);
  const known = keysOf([...side.dates, ...slashDates(side).filter((d) => seen.has(key(d)))]);
  const room = other.dates.filter((d) => !known.has(key(d))).length;
  return { seen, twins: new Set(other.slashes.map(digits)), room };
};

const matched = (slash: Slash, view: View): boolean =>
  slash.date !== null && view.seen.has(key(slash.date));

const changed = (slash: Slash, view: View): boolean =>
  slash.date !== null && !matched(slash, view) && !view.twins.has(digits(slash));

/** (a) every matched slash form; (b) the first `room` changed ones, in order; (c) the rest. */
const datedOf = (side: Tokens, view: View): Set<Slash> => {
  const changes = side.slashes.filter((s) => changed(s, view)).slice(0, view.room);
  return new Set([...side.slashes.filter((s) => matched(s, view)), ...changes]);
};

/** The slash forms read as dates join the dates; the rest are numbers, keeping any weekday. */
const slashesResolved = (
  side: Tokens,
  other: Tokens,
): Pick<Tokens, "dates" | "numbers" | "weekdays"> => {
  const dated = datedOf(side, viewOf(side, other));
  const plain = side.slashes.filter((s) => !dated.has(s));
  const dates = side.slashes.filter((s) => dated.has(s)).flatMap((s) => s.date ?? []);
  const weekdays = [...side.weekdays, ...plain.flatMap((s) => s.weekday ?? [])];
  return { dates: [...side.dates, ...dates], numbers: plain.flatMap((s) => s.numbers), weekdays };
};

/** Numbers: the side's own, then slash forms, candidates and price parts, then plain-space groups. */
const numbersOf = (side: Tokens, other: Tokens, extra: readonly string[]): string[] => [
  ...side.numbers,
  ...extra,
  ...spacedNumbers(side, other),
];

/** Nothing is left to resolve once a side is resolved (fresh arrays for each side). */
const nothingLeft = (): Pick<Tokens, "slashes" | "spaced" | "spacedMoney" | "candidates"> => ({
  slashes: [],
  spaced: [],
  spacedMoney: [],
  candidates: [],
});

const resolved = (side: Tokens, other: Tokens): Tokens => {
  const [slashes, clock] = [slashesResolved(side, other), resolveCandidates(side, other)];
  const prices = spacedPrices(side, other);
  const numbers = numbersOf(side, other, [...slashes.numbers, ...clock.numbers, ...prices.numbers]);
  return { ...side, ...slashes, ...prices, numbers, times: clock.times, ...nothingLeft() };
};

/**
 * Resolves each side's two-way twelves, then its slash forms, plain-space groups (numbers and
 * prices) and candidate times, against the other's.
 */
export const resolvePair = (master: Tokens, target: Tokens): [Tokens, Tokens] => {
  const [m, t] = [withTwelves(master, target), withTwelves(target, master)];
  return [resolved(m, t), resolved(t, m)];
};
