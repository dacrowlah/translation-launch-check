import type { Money } from "./money";
import type { Groups } from "./take";

/** Prices an amount as written, with its multiplier chain, in the match's currency. */
export type Pricer = (raw: string, chain?: string) => Money;
/** An amount's numeral as written, without any chain ("3" in "3\u4e07"). */
export type Numeral = (raw: string) => number;

/** The range ends a match keeps, and where its used part starts and how long it is. */
export interface Range {
  readonly start: Money[];
  readonly end: Money[];
  readonly from: number;
  readonly length: number;
}

/**
 * A start with no chain of its own takes the end's when its numeral is smaller: "1\uff5e3\u4e07\u5186"
 * is 10,000-30,000, "500\uff5e1\u4e07\u5186" stays 500-10,000.
 */
const startChain = (g: Groups, numeral: Numeral): string | undefined =>
  g.x0 !== undefined || g.a0 === undefined || numeral(g.a0) >= numeral(g.a ?? "1") ? g.x0 : g.x;

/** A range runs upwards, as a percent range does ("Give $20 to 3 friends" is no range). */
const upwards = (from: Money, to: Money): boolean => Number(from.amount) <= Number(to.amount);

const startOf = (g: Groups, price: Pricer, main: Money, numeral: Numeral): Money[] => {
  if (g.a0 === undefined) return [];
  const start = price(g.a0, startChain(g, numeral));
  return upwards(start, main) ? [start] : [];
};

const endOf = (g: Groups, price: Pricer, main: Money): Money[] => {
  if (g.a2 === undefined) return [];
  const end = price(g.a2, g.x2);
  return upwards(main, end) ? [end] : [];
};

/** The ends a match holds around its price; an end that is no range stays text for later stages. */
export const rangeOf = (
  m: RegExpExecArray,
  price: Pricer,
  main: Money,
  numeral: Numeral,
): Range => {
  const g: Groups = m.groups ?? {};
  const [start, end] = [startOf(g, price, main, numeral), endOf(g, price, main)];
  const from = start.length === 0 ? (g.s0?.length ?? 0) : 0;
  const cut = end.length === 0 ? (g.e2?.length ?? 0) : 0;
  return { start, end, from, length: m[0].length - from - cut };
};
