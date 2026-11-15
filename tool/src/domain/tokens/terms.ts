import type { Rules } from "../rules";
import { perRules } from "./per-rules";
import { alternatives, longestFirst, termSource } from "./regex";

/** A term's words may be joined by spaces, no-break spaces or hyphens ("Black-Friday"). */
export const termsPattern = (terms: readonly string[]): RegExp =>
  new RegExp(alternatives(terms, termSource), "giu");

/** The master's do-not-translate terms, longest first ("TrailPro Ultra" before "TrailPro"). */
export const dntTerms = (rules: Rules): string[] => longestFirst(rules.glossary.do_not_translate);

/** Every do-not-translate term as one source; matches nothing when there are none. */
export const dntSource = (rules: Rules): string => alternatives(dntTerms(rules), termSource);

/** The do-not-translate terms, built once per rules ("g": shared only through replace). */
export const dntPattern = perRules((rules) => new RegExp(dntSource(rules), "giu"));
