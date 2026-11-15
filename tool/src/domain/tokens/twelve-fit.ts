import { MINUTES_PER_DAY, minutesOfClock } from "./clock-values.js";
import { countOf, type Counts } from "./tally.js";
import type { Placed } from "./times.js";

/**
 * How a convention's values fit the other side: how many it holds room for, and how far the
 * values that do not fit lie from the other side's values that nothing took (in minutes).
 */
export interface Fit {
  readonly fitting: number;
  readonly distance: number;
}

/** Minutes between two clock times around the dial (23:00 and 01:00 are 120 apart). */
const apart = (a: string, b: string): number => {
  const gap = Math.abs(minutesOfClock(a) - minutesOfClock(b));
  return Math.min(gap, MINUTES_PER_DAY - gap);
};

/** One place for the time if the other side has room left; says whether it had. */
const claimed = (room: Map<string, number>, time: string): boolean => {
  const left = room.get(time) ?? 0;
  room.set(time, left - 1);
  return left > 0;
};

/** The sum, over the values that do not fit, of the distance to the nearest open value. */
const distanceOf = (unmatched: readonly string[], open: readonly string[]): number =>
  open.length === 0
    ? 0
    : unmatched.reduce((sum, time) => sum + Math.min(...open.map((o) => apart(time, o))), 0);

/** How the values fit what the other side has room for, after this side's definite times. */
export const fitOf = (values: readonly Placed[], theirs: Counts, mine: Counts): Fit => {
  const room = new Map([...theirs].map(([time, n]) => [time, n - countOf(mine, time)]));
  const unmatched = values.filter((v) => !claimed(room, v.time)).map((v) => v.time);
  const open = [...room].flatMap(([time, n]) => Array.from({ length: Math.max(0, n) }, () => time));
  return { fitting: values.length - unmatched.length, distance: distanceOf(unmatched, open) };
};

/** The second convention wins with more values that fit, or as many and the rest nearer. */
export const secondFitsBetter = (second: Fit, usual: Fit): boolean =>
  second.fitting > usual.fitting ||
  (second.fitting === usual.fitting && second.distance < usual.distance);
