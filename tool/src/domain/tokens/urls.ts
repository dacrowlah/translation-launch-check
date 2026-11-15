import { ENCODED_AMPERSAND, URL_SOURCE } from "./link-patterns.js";
import { takeParts, type Part } from "./take.js";

/** query: every key=value pair in order, repeated keys included. */
export interface Url {
  readonly raw: string;
  readonly host: string;
  readonly path: string;
  readonly query: readonly (readonly [string, string])[];
}

const ALWAYS = /[.,;:!?]/u;
const OPENER: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

const count = (text: string, char: string): number => text.split(char).length - 1;

interface Walk {
  readonly keep: number;
  /** Per closer, how many more closers than openers are still there to strip. */
  readonly excess: Readonly<Record<string, number>>;
  readonly done: boolean;
}

const excessOf = (text: string): Record<string, number> =>
  Object.fromEntries(Object.entries(OPENER).map(([c, o]) => [c, count(text, c) - count(text, o)]));

const back = (walk: Walk, char: string): Walk => {
  const excess = walk.excess[char] ?? 0;
  if (walk.done || (!ALWAYS.test(char) && excess <= 0)) return { ...walk, done: true };
  return { keep: walk.keep - 1, excess: { ...walk.excess, [char]: excess - 1 }, done: false };
};

/** One backward pass: punctuation always goes, a closer only while it lacks an opener. */
const strip = (text: string): string => {
  const start: Walk = { keep: text.length, excess: excessOf(text), done: false };
  return text.slice(0, [...text].reduceRight(back, start).keep);
};

/**
 * One run of escapes as UTF-8, with a decoded "%" escaped again so it never joins the text
 * after it into an escape ("%2541" is no "%41"); a run that is no UTF-8 ("%FC") stays as
 * written, in upper case.
 */
const decodedRun = (run: string): string => {
  try {
    return decodeURIComponent(run).replaceAll("%", "%25");
  } catch {
    return run.toUpperCase();
  }
};

/**
 * A query key or value decoded as UTF-8, "+" as a space. When the whole part is no UTF-8, each
 * run of escapes is decoded on its own, and a run that is no UTF-8 ("%FCbersicht") stays as
 * written, so two legacy-encoded values never compare equal as replacement characters.
 */
const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part.replaceAll("+", " "));
  } catch {
    return part.replaceAll("+", " ").replace(/(?:%[0-9a-f]{2})+/giu, decodedRun);
  }
};

const pairOf = (field: string): [string, string] => {
  const at = field.includes("=") ? field.indexOf("=") : field.length;
  return [decoded(field.slice(0, at)), decoded(field.slice(at + 1))];
};

/** Every key=value pair of the query in order, empty fields skipped ("a=1&&b=2"). */
const queryOf = (search: string): [string, string][] =>
  search
    .slice(1)
    .split("&")
    .filter((field) => field !== "")
    .map(pairOf);

const shape = (url: URL, raw: string): Url => ({
  raw,
  host: url.hostname,
  path: url.pathname,
  query: queryOf(url.search),
});

/** A www. link is read as https; raw stays as written. */
const parse = (raw: string): Url | null => {
  try {
    return shape(new URL(/^www\./iu.test(raw) ? `https://${raw}` : raw), raw);
  } catch {
    return null;
  }
};

const AMPERSANDS = new RegExp(ENCODED_AMPERSAND, "gu");
const LINKS = new RegExp(URL_SOURCE, "gu");

/** A link in a quoted href is kept whole; in running text, closing punctuation is stripped. */
const read = (match: RegExpExecArray): Part<Url> | null => {
  const raw = match.groups?.q === undefined ? strip(match[0]) : match[0];
  const url = parse(raw.replace(AMPERSANDS, "&"));
  return url ? { item: url, length: raw.length } : null;
};

/** The query as "key=value" strings, in order. */
export const params = (url: Url): string[] => url.query.map(([key, value]) => `${key}=${value}`);

/** Finds links minus trailing punctuation, which stays in rest; so does an unparseable one. */
export const extractUrls = (text: string): { urls: Url[]; rest: string } => {
  const { items, rest } = takeParts(text, LINKS, read);
  return { urls: items, rest };
};
