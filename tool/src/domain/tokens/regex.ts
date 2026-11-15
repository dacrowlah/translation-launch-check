/** Escapes text for a pattern built with the "u" flag, outside a character class. */
export const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");

/** Escapes one character for use inside a [...] class. */
export const escapeInClass = (char: string): string => char.replace(/[\]\\^-]/gu, "\\$&");

/** A pattern that matches nothing. */
export const NEVER = "(?!)";

/** One of the characters, as a [...] class; matches nothing when there are none. */
export const anyChar = (chars: readonly string[]): string =>
  chars.length === 0 ? NEVER : `[${chars.map(escapeInClass).join("")}]`;

/** The no-break and narrow no-break spaces, as the body of a [...] class. */
export const NO_BREAK_SPACES = "\\u00a0\\u202f";

/** The spaces that sit between a number and its sign or between grouped digits. */
export const SPACE = `[ ${NO_BREAK_SPACES}]`;

/** A Latin letter: the neighbour that makes a match part of a longer word. */
export const LATIN = "\\p{Script=Latin}";

/** An ASCII word in either case, letter by letter ("www" -> "[Ww][Ww][Ww]"). */
export const anyCase = (word: string): string =>
  [...word].map((c) => `[${c.toUpperCase()}${c}]`).join("");

/** Longest first, as written: for patterns that run on the text as sent. */
export const longestFirst = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => b.length - a.length);

/**
 * Alternation of the names as written, longest first; never empty (an empty list matches
 * nothing). `sourceOf` turns one name into its pattern (escaped by default).
 */
export const alternatives = (names: readonly string[], sourceOf = escape): string =>
  names.length === 0 ? NEVER : longestFirst(names).map(sourceOf).join("|");

/** Alternation of the NFKC forms of the names (for NFKC text), longest first; never empty. */
export const alternation = (names: readonly string[], sourceOf = escape): string =>
  alternatives(
    names.map((name) => name.normalize("NFKC")),
    sourceOf,
  );

/** A term whose words may be joined by spaces (no-break ones too: "\s") or hyphens. */
export const termSource = (term: string): string =>
  term
    .split(/[\s-]+/u)
    .map(escape)
    .join("[\\s-]+");

/** Any of the pattern sources, each grouped; matches nothing when there are none. */
export const anyOfSources = (sources: readonly string[]): string =>
  sources.length === 0 ? NEVER : sources.map((source) => `(?:${source})`).join("|");
