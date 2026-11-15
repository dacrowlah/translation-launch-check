import type { TwelveOClock } from "../rules";
import { MINUTES_PER_DAY, minutesOf, NOON, twelveHour } from "./clock-values";
import type { Groups } from "./take";

const AM: Groups = { am: "am" };
const PM: Groups = { pm: "pm" };
const otherHalf = (half: Groups): Groups => (half.pm === undefined ? PM : AM);

/** A pm 12 read as midnight (\u5348\u5f8c12\u6642) closes the pm half: as a start it is 24:00. */
const startMinutes = (start: Groups, twelve: TwelveOClock): number | null => {
  const minutes = minutesOf(start, twelve);
  return minutes !== null && start.pm !== undefined && minutes < NOON
    ? minutes + MINUTES_PER_DAY
    : minutes;
};

/** True unless the end comes before the start; a midnight end counts as 24:00 if `late`. */
const inOrder = (start: Groups, end: Groups, twelve: TwelveOClock, late: boolean): boolean => {
  const [from, to] = [startMinutes(start, twelve), minutesOf(end, twelve)];
  return from === null || to === null || (to === 0 && late ? MINUTES_PER_DAY : to) >= from;
};

/**
 * "11-12am" runs from 11:00 to noon: a bare start of 1 to 11 before an am 12 that the rule
 * reads as midnight ends at noon instead (the pm 12). An explicit am start ("11am-12am") is
 * left as written and ends at midnight.
 */
export const noonEnd = (g: Groups, twelve: TwelveOClock): Groups => {
  const start = Number(g.h0);
  const morning = g.am0 === undefined && g.pm0 === undefined && start >= 1 && start <= 11;
  const midnight = g.am !== undefined && Number(g.h) === 12 && twelve.am[0] === 0;
  return morning && midnight ? { ...g, am: undefined, ...PM } : g;
};

/** A start with no half takes the end's, or the other half when it would come after the end. */
const startHalf = (g: Groups, twelve: TwelveOClock): Groups => {
  if (g.am0 !== undefined || g.pm0 !== undefined) return { am: g.am0, pm: g.pm0 };
  if (!twelveHour(g)) return {};
  const half = g.pm === undefined ? AM : PM;
  const start = { h: g.h0, m: g.m0, ...half };
  return inOrder(start, g, twelve, false) ? half : otherHalf(half);
};

export const startOf = (g: Groups, twelve: TwelveOClock): Groups => ({
  h: g.h0,
  m: g.m0,
  half: g.half0,
  ...startHalf(g, twelve),
});

/**
 * An end with no half takes the start's (\u5348\u5f8c1\u6642\uff5e5\u6642 ends at 17:00), or the
 * other half when the start's would make it end first (\u5348\u524d11\u6642\uff5e1\u6642).
 */
export const endOf = (g: Groups, twelve: TwelveOClock): Groups => {
  if (twelveHour(g) || (g.am0 === undefined && g.pm0 === undefined)) return g;
  const carried = { ...g, am: g.am0, pm: g.pm0 };
  return inOrder(startOf(g, twelve), carried, twelve, true)
    ? carried
    : { ...g, ...otherHalf(carried) };
};
