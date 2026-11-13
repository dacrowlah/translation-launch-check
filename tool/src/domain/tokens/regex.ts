/** Escapes text for a pattern built with the "u" flag, outside a character class. */
export const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");

/** Escapes one character for use inside a [...] class. */
export const escapeInClass = (char: string): string => char.replace(/[\]\\^-]/gu, "\\$&");

const longestFirst = (names: readonly string[]): string[] =>
  names.map((name) => name.normalize("NFKC")).sort((a, b) => b.length - a.length);

/** Alternation of the names, longest first; matches nothing when there are none. */
export const alternation = (names: readonly string[]): string =>
  names.length === 0 ? "(?!)" : longestFirst(names).map(escape).join("|");
