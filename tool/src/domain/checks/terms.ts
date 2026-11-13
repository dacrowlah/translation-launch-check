import type { Rules } from "../rules";
import { escape } from "../tokens/regex";
import { tokenize, type Tokens } from "../tokens/tokenize";

const termPattern = (term: string): string =>
  term
    .split(/[\s-]+/u)
    .map(escape)
    .join("[\\s-]");

/** A term's words may be joined by a space, hyphen or no-break space ("Black-Friday"). */
export const termsPattern = (terms: readonly string[]): RegExp =>
  new RegExp(terms.length === 0 ? "(?!)" : terms.map(termPattern).join("|"), "giu");

/** The master's do-not-translate terms, longest first ("TrailPro Ultra" before "TrailPro"). */
export const dntTerms = (rules: Rules): string[] =>
  [...rules.glossary.do_not_translate].sort((x, y) => y.length - x.length);

/** Do-not-translate terms ("Black Friday") hold weekday names that are not dates. */
export const tokensWithoutTerms = (text: string, locale: string, rules: Rules): Tokens =>
  tokenize(text.replace(termsPattern(dntTerms(rules)), " "), locale, rules);
