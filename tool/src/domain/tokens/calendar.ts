const DAY_MS = 86_400_000;
const LOOKAHEAD_YEARS = 8;

const parts = (iso: string): [number, number, number] => {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return [year, month, day];
};

const epochDays = (year: number, month: number, day: number): number =>
  Date.UTC(year, month - 1, day) / DAY_MS;

const daysIn = (year: number, month: number): number =>
  epochDays(year, month + 1, 1) - epochDays(year, month, 1);

const iso = (year: number, month: number, day: number): string =>
  [year, month, day].map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0")).join("-");

/** Weekday of an ISO date, Monday = 0 (1970-01-01 was a Thursday). */
export const weekdayOf = (date: string): number => (epochDays(...parts(date)) + 3) % 7;

const occursIn = (year: number, month: number, day: number, today: string): boolean =>
  day <= daysIn(year, month) && iso(year, month, day) >= today;

/** The first date on or after today on this month and day; null when no such date exists. */
export const nextOccurrence = (month: number, day: number, today: string): string | null => {
  const first = parts(today)[0];
  const years = Array.from({ length: LOOKAHEAD_YEARS }, (_, i) => first + i);
  const found = years.find((year) => occursIn(year, month, day, today));
  return found === undefined ? null : iso(found, month, day);
};
