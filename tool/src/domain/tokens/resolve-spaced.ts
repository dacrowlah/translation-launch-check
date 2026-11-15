import type { Spaced } from "./numbers";
import { countOf, countsOf, withinRoom } from "./tally";
import type { Tokens } from "./tokenize";

/** The other side's values a plain-space group may stand for: numbers, groups and prices. */
const numberValuesOf = (side: Tokens): string[] => [
  ...side.numbers,
  ...side.spaced.map((s) => s.joined),
  ...side.money.map((m) => m.amount),
];

const joinedOf = (g: Spaced): string => g.joined;

/**
 * "10 000" is one number as often as the other side holds 10000 ("10,000", "10.000", "10 000",
 * "$10,000"). Otherwise it is its parts when one of them stands opposite ("Top 5 100%"), and
 * the whole number when none does ("10 500" opposite "10,000" is one changed number).
 */
export const spacedNumbers = (side: Tokens, other: Tokens): string[] => {
  const theirs = countsOf(numberValuesOf(other));
  const whole = withinRoom(side.spaced, joinedOf, (joined) => countOf(theirs, joined));
  const apart = (g: Spaced) => !whole.has(g) && g.parts.some((p) => countOf(theirs, p) > 0);
  return side.spaced.flatMap((g) => (apart(g) ? g.parts : [g.joined]));
};
