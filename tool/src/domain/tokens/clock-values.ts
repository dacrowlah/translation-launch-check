import type { TwelveOClock } from "../rules.js";
import { twoDigits } from "./calendar.js";
import type { Groups } from "./take.js";

/** Minutes in a day, and noon in minutes after midnight. */
export const MINUTES_PER_DAY = 1440;
export const NOON = 720;

export const twelveHour = (g: Groups): boolean => g.am !== undefined || g.pm !== undefined;

/** 12-hour hours run 0-12 (\u5348\u524d0\u6642 is midnight); 24-hour ones to 24:00 (midnight). */
const valid = (h: number, m: number, g: Groups): boolean =>
  m < 60 && (twelveHour(g) ? h <= 12 : h < 24 || (h === 24 && m === 0));

/** 12 with am or pm stands for the hour the rule's first reading gives. */
const hourOf = (h: number, g: Groups, twelve: TwelveOClock): number | null => {
  if (!twelveHour(g)) return h % 24;
  if (h === 12) return (g.pm === undefined ? twelve.am : twelve.pm)[0] ?? null;
  return (h % 12) + (g.pm === undefined ? 0 : 12);
};

/**
 * Minutes after midnight of a clock time's groups (h, m, half and am or pm), or null when the
 * groups are no time.
 */
export const minutesOf = (g: Groups, twelve: TwelveOClock): number | null => {
  const [h, m] = [Number(g.h), g.half === undefined ? Number(g.m ?? "0") : 30];
  const hour = valid(h, m, g) ? hourOf(h, g, twelve) : null;
  return hour === null ? null : hour * 60 + m;
};

export const clockOf = (g: Groups, twelve: TwelveOClock): string | null => {
  const minutes = minutesOf(g, twelve);
  return minutes === null
    ? null
    : `${twoDigits(Math.floor(minutes / 60))}:${twoDigits(minutes % 60)}`;
};

/** Minutes after midnight of an "HH:MM" clock time (clockOf's inverse). */
export const minutesOfClock = (time: string): number => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * The language's second way of reading 12 o'clock, if it has one (Japanese: \u5348\u524d12\u6642
 * is noon by the default rule and midnight by the other; both are in use).
 */
export const secondReading = (twelve: TwelveOClock): TwelveOClock | null =>
  twelve.am.length < 2 && twelve.pm.length < 2
    ? null
    : { am: twelve.am.slice(-1), pm: twelve.pm.slice(-1) };
