/** A match's named groups, as read. */
export type Groups = Readonly<Record<string, string | undefined>>;

export interface Taken<T> {
  readonly items: T[];
  readonly rest: string;
}

/** The item read from a match, and which of its characters it uses: `length` from `from`. */
export interface Part<T> {
  readonly item: T;
  /** Where the used part starts in the match (0 when omitted). */
  readonly from?: number;
  readonly length: number;
  /** What the used part leaves in rest instead of one space (text a later stage still reads). */
  readonly keep?: string;
}

/** A reader turns one match into an item, or answers null to leave the match in the text. */
export type Reader<T> = (match: RegExpExecArray) => T | null;

interface Kept<T> {
  readonly part: Part<T>;
  readonly at: number;
}

const keptOf = <T>(match: RegExpExecArray, read: Reader<Part<T>>): Kept<T>[] => {
  const part = read(match);
  return part === null ? [] : [{ part, at: match.index + (part.from ?? 0) }];
};

/** Where a piece of the text starts and how long it is. */
export interface Cut {
  readonly at: number;
  readonly length: number;
}

export const cutOf = (match: RegExpExecArray): Cut => ({
  at: match.index,
  length: match[0].length,
});

/** The text before, between and after the ordered cuts: one more gap than cuts. */
export const gapsBetween = (text: string, cuts: readonly Cut[]): string[] => {
  const ends = [0, ...cuts.map((c) => c.at + c.length)];
  const starts = [...cuts.map((c) => c.at), text.length];
  return ends.map((from, i) => text.slice(from, starts[i]));
};

/** Each gap followed by the item of the cut after it: gap, item, gap, ..., gap. */
export const interleaved = <T>(gaps: readonly T[], items: readonly T[]): T[] =>
  gaps.flatMap((gap, i) => [gap, ...items.slice(i, i + 1)]);

/** The text between the kept parts, each part replaced by one space (or what it keeps). */
const restOf = <T>(text: string, kept: readonly Kept<T>[]): string => {
  const cuts = kept.map((k) => ({ at: k.at, length: k.part.length }));
  return interleaved(
    gapsBetween(text, cuts),
    kept.map((k) => k.part.keep ?? " "),
  ).join("");
};

/** Like takeWith, but only the part of each match the reader uses becomes the space. */
export const takeParts = <T>(text: string, pattern: RegExp, read: Reader<Part<T>>): Taken<T> => {
  const kept = [...text.matchAll(pattern)].flatMap((m) => keptOf(m, read));
  return { items: kept.map((k) => k.part.item), rest: restOf(text, kept) };
};

const whole =
  <T>(read: Reader<T>): Reader<Part<T>> =>
  (match) => {
    const item = read(match);
    return item === null ? null : { item, length: match[0].length };
  };

/** Every match of the "g" pattern the reader accepts becomes an item and one space in rest. */
export const takeWith = <T>(text: string, pattern: RegExp, read: Reader<T>): Taken<T> =>
  takeParts(text, pattern, whole(read));
