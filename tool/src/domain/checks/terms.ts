import type { LocaleRule, Rules } from "../rules";
import { perRules } from "../tokens/per-rules";
import { alternatives, longestFirst, termSource } from "../tokens/regex";
import { tokenize, type Tokens } from "../tokens/tokenize";

/** A term's words may be joined by spaces, no-break spaces or hyphens ("Black-Friday"). */
export const termsPattern = (terms: readonly string[]): RegExp =>
  new RegExp(alternatives(terms, termSource), "giu");

/** The master's do-not-translate terms, longest first ("TrailPro Ultra" before "TrailPro"). */
export const dntTerms = (rules: Rules): string[] => longestFirst(rules.glossary.do_not_translate);

/** Every do-not-translate term as one source; matches nothing when there are none. */
export const dntSource = (rules: Rules): string => alternatives(dntTerms(rules), termSource);

/** The do-not-translate terms, built once per rules ("g": shared only through replace). */
export const dntPattern = perRules((rules) => new RegExp(dntSource(rules), "giu"));

/** Do-not-translate terms ("Black Friday") hold weekday names that are not dates. */
export const tokensWithoutTerms = (text: string, rule: LocaleRule, rules: Rules): Tokens =>
  tokenize(text.replace(dntPattern(rules), " "), rule, rules);
