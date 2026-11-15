export type Counts = ReadonlyMap<string, number>;

/** How often each value occurs (one pass). */
export const countsOf = (values: readonly string[]): Counts => {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
};

export const countOf = (counts: Counts, value: string): number => counts.get(value) ?? 0;

/** Each key's occurrence among the keys before it: 0 for the first, 1 for the second... */
const occurrences = (keys: readonly string[]): number[] => {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
};

/** The items whose key has room left: the n-th item of a key (from 0) while n < room(key). */
export const withinRoom = <T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  room: (key: string) => number,
): Set<T> => {
  const keys = items.map(keyOf);
  const nth = occurrences(keys);
  return new Set(items.filter((_item, i) => (nth[i] ?? 0) < room(keys[i] ?? "")));
};
