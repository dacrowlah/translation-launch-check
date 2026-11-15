import { countOf, countsOf, withinRoom, type Counts } from "./tally";
import type { Candidate } from "./times";
import type { Tokens } from "./tokenize";

type Side = Pick<Tokens, "times" | "candidates" | "numbers">;

/** A candidate with one number ("24" in "24 h"), or "" (a word, or a range start of two). */
const digitsOf = (c: Candidate): string => (c.numbers.length === 1 ? (c.numbers[0] ?? "") : "");

/** The candidates whose time the other side does not write as a definite time more often. */
const untimedOf = (side: Side, other: Side): Candidate[] => {
  const [mine, theirs] = [countsOf(side.times), countsOf(other.times)];
  return side.candidates.filter((c) => countOf(theirs, c.time) <= countOf(mine, c.time));
};

/**
 * Step 0: "24 h" opposite a plain "24" that this side lacks stays the number 24, unless the
 * other side writes that very time ("21 h" opposite "9 PM" and "21 left" is 21:00).
 */
const asNumbers = (side: Side, other: Side): Set<Candidate> => {
  const [mine, theirs] = [countsOf(side.numbers), countsOf(other.numbers)];
  const spare = (d: string) => (d === "" ? 0 : countOf(theirs, d) - countOf(mine, d));
  return withinRoom(untimedOf(side, other), digitsOf, spare);
};

/** A side's definite times and its candidates still open after step 0, counted by value. */
interface Pool {
  readonly open: readonly Candidate[];
  readonly definite: Counts;
  readonly candidates: Counts;
}

const poolOf = (side: Side, other: Side): Pool => {
  const kept = asNumbers(side, other);
  const open = side.candidates.filter((c) => !kept.has(c));
  return { open, definite: countsOf(side.times), candidates: countsOf(open.map((c) => c.time)) };
};

/** Step 1: a candidate pairs with an equal time of the other side, definite or candidate. */
const byValue = (mine: Pool, theirs: Pool): Set<Candidate> => {
  const room = (v: string) =>
    countOf(theirs.definite, v) + countOf(theirs.candidates, v) - countOf(mine.definite, v);
  return withinRoom(mine.open, (c) => c.time, room);
};

/** Definite times of `a` that no time of `b` (definite or candidate) has the value of. */
const unpaired = (a: Pool, b: Pool): number =>
  [...a.definite].reduce(
    (sum, [v, n]) => sum + Math.max(0, n - countOf(b.definite, v) - countOf(b.candidates, v)),
    0,
  );

/** Step 2: the rest, in text order, only against the other side's unpaired definite times. */
const byOrder = (mine: Pool, theirs: Pool, paired: ReadonlySet<Candidate>): Candidate[] => {
  const room = Math.max(0, unpaired(theirs, mine) - unpaired(mine, theirs));
  return mine.open.filter((c) => !paired.has(c)).slice(0, room);
};

const timesOf = (side: Side, other: Side): Set<Candidate> => {
  const [mine, theirs] = [poolOf(side, other), poolOf(other, side)];
  const paired = byValue(mine, theirs);
  return new Set([...paired, ...byOrder(mine, theirs, paired)]);
};

/**
 * A candidate ("21 h", "midnight") becomes a time by value first, then in order against the
 * other side's unpaired definite times; the rest are what they say: digits or words.
 */
export const resolveCandidates = (side: Side, other: Side): Pick<Tokens, "times" | "numbers"> => {
  const times = timesOf(side, other);
  const promoted = side.candidates.filter((c) => times.has(c)).map((c) => c.time);
  const numbers = side.candidates.filter((c) => !times.has(c)).flatMap((c) => c.numbers);
  return { times: [...side.times, ...promoted], numbers };
};
