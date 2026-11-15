import type { Money, SpacedMoney } from "./money.js";
import { countOf, countsOf, withinRoom, type Counts } from "./tally.js";
import type { Tokens } from "./tokenize.js";

const keyOf = (m: Money): string => `${m.amount} ${m.currency}`;

/** The other side's prices a plain-space group may stand for, whole ones included. */
const pricesOf = (side: Tokens): Counts =>
  countsOf([...side.money, ...side.spacedMoney.map((s) => s.whole)].map(keyOf));

/** The groups to read as their parts: the other side lacks them whole but holds the first part. */
const apartOf = (spaced: readonly SpacedMoney[], theirs: Counts): Set<SpacedMoney> => {
  const whole = withinRoom(
    spaced,
    (s) => keyOf(s.whole),
    (k) => countOf(theirs, k),
  );
  return new Set(spaced.filter((s) => !whole.has(s) && countOf(theirs, keyOf(s.first)) > 0));
};

/**
 * "\u20ac 2 000" is one price as often as the other side holds it ("\u20ac2,000"). Otherwise it
 * is its first part and numbers when that part stands opposite ("\u20ac2": a changed number), and
 * the whole price when nothing does ("\u20ac 2 500" opposite "\u20ac2,000": one changed price).
 */
export const spacedPrices = (side: Tokens, other: Tokens): Pick<Tokens, "money" | "numbers"> => {
  const apart = apartOf(side.spacedMoney, pricesOf(other));
  const money = side.spacedMoney.map((s) => (apart.has(s) ? s.first : s.whole));
  return { money: [...side.money, ...money], numbers: [...apart].flatMap((s) => s.rest) };
};
