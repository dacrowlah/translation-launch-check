import type { Rules } from "../rules.js";
import { escapeInClass } from "../tokens/regex.js";
import { rewriteOutside } from "./spans.js";
import { keepCase, LATIN_WORD, wholeWordSource } from "./words.js";

type Fix = (word: string) => string;
type Change = [from: string, to: string];
type Plan = { readonly pattern: string; readonly fix: Fix };

const IZE = /iz(?=(?:e|es|ed|ing|ation)$)/iu;
const MIN_IZE_LETTERS = 6;

/** "Organizing" -> "organize": the form the exceptions list names. */
const stemOf = (word: string): string =>
  word.toLowerCase().replace(/iz(?:e|es|ed|ing|ation)$/u, "ize");

const iseOf = (word: string, exceptions: readonly string[]): string =>
  word.length >= MIN_IZE_LETTERS && !exceptions.includes(stemOf(word))
    ? word.replace(IZE, (zed) => keepCase(zed, "is"))
    : word;

const wordFix =
  (words: Readonly<Record<string, string>>, ize: Fix): Fix =>
  (word) => {
    const to = new Map(Object.entries(words)).get(word.toLowerCase().replace(/\s+/gu, " "));
    return to === undefined ? ize(word) : keepCase(word, to);
  };

const gbPlan = (rule: Rules["spelling"]["en-GB"]): Plan => ({
  pattern: `${wholeWordSource(Object.keys(rule.words))}|${LATIN_WORD}`,
  fix: wordFix(rule.words, (word) => (rule.ize_to_ise ? iseOf(word, rule.ize_exceptions) : word)),
});

const chPlan = ({ chars }: Rules["spelling"]["de-CH"]): Plan => {
  const set = new RegExp(`[${Object.keys(chars).map(escapeInClass).join("")}]`, "gu");
  return { pattern: LATIN_WORD, fix: (word) => word.replace(set, (c) => chars[c] ?? c) };
};

const planFor = (locale: string, rules: Rules): Plan | undefined =>
  ({
    "en-GB": () => gbPlan(rules.spelling["en-GB"]),
    "de-CH": () => chPlan(rules.spelling["de-CH"]),
  })[locale as "en-GB"]?.();

const recorder =
  (fix: Fix, changes: Change[]): Fix =>
  (word) => {
    const to = fix(word);
    if (to !== word) changes.push([word, to]);
    return to;
  };

const apply = (text: string, plan: Plan, rules: Rules): { fixed: string; changes: Change[] } => {
  const changes: Change[] = [];
  const fixed = rewriteOutside(text, rules, plan.pattern, recorder(plan.fix, changes));
  return { fixed, changes };
};

/** The market's spelling applied outside URLs and merge tags, with each [from, to] change. */
export const spellingFix = (
  text: string,
  locale: string,
  rules: Rules,
): { fixed: string; changes: Change[] } => {
  const plan = planFor(locale, rules);
  return plan ? apply(text, plan, rules) : { fixed: text, changes: [] };
};
