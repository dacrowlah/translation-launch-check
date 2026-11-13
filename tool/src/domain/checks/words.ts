import { escape } from "../tokens/regex";

const LATIN = "\\p{Script=Latin}";
export const LATIN_WORD = `${LATIN}+`;

const phrase = (term: string): string => term.split(/\s+/u).map(escape).join("\\s+");

/** Terms as whole words: a neighbouring Latin letter blocks a match, so CJK text still matches. */
export const wholeWordSource = (terms: readonly string[]): string => {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const any = sorted.length === 0 ? "(?!)" : sorted.map(phrase).join("|");
  return `(?<!${LATIN})(?:${any})(?!${LATIN})`;
};

export const wholeWords = (terms: readonly string[], flags: string): RegExp =>
  new RegExp(wholeWordSource(terms), flags);

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** `to`, cased like `from`: lower, Capitalized or ALL CAPS. */
export const keepCase = (from: string, to: string): string => {
  if (from.length > 1 && from === from.toUpperCase()) return to.toUpperCase();
  return from.charAt(0) === from.charAt(0).toUpperCase() ? capitalize(to) : to;
};
