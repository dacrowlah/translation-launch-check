import { countsOf, type Counts } from "./tally.js";
import { fitOf, secondFitsBetter } from "./twelve-fit.js";
import { placed, type Placed, type Twelve } from "./times.js";
import type { Tokens } from "./tokenize.js";

/** The times of two-way twelves by their default reading. */
export const usualTimes = (twelves: readonly Twelve[]): string[] =>
  twelves.flatMap(({ readings: [usual] }) => usual.map((v) => v.time));

/** Every clock value the other side writes, twelves by their default reading. */
const clockValuesOf = (side: Tokens): string[] => [
  ...side.times,
  ...side.candidates.map((c) => c.time),
  ...usualTimes(side.twelves),
];

/**
 * One convention for every twelve of a side: the second reading when more of its values fit
 * what the other side has room for (after this side's definite times) than of the default's
 * ("12 PM - 12 AM" opposite \u5348\u5f8c12\u6642\uff5e\u5348\u524d0\u6642: noon). On a tie, the one
 * whose values that do not fit lie nearer the other side's open values (a changed range end
 * shows as 18:00 -> 19:00, not 07:00); the default when that ties too. The same written twelve
 * never means noon and midnight in one line.
 */
const readingOf = (side: Tokens, theirs: Counts): readonly Placed[] => {
  const usual = side.twelves.flatMap(({ readings: [first] }) => first);
  const second = side.twelves.flatMap(({ readings: [, other] }) => other);
  const mine = countsOf(side.times);
  return secondFitsBetter(fitOf(second, theirs, mine), fitOf(usual, theirs, mine)) ? second : usual;
};

/** The side with its twelves read and placed among its times or candidates. */
export const withTwelves = (side: Tokens, other: Tokens): Tokens => {
  const read = placed(readingOf(side, countsOf(clockValuesOf(other))));
  const candidates = [...side.candidates, ...read.candidates];
  return { ...side, times: [...side.times, ...read.times], candidates, twelves: [] };
};
