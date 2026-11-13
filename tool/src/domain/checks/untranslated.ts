import type { Rules } from "../rules";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";
import { tokensWithoutTerms } from "./terms";

export const UNTRANSLATED_DETAIL = "The line is the same as the master.";

const UNTRANSLATED: Spec = { check: "untranslated", detail: UNTRANSLATED_DETAIL };

/** The words left once terms, tags, URLs, codes, numbers and punctuation are gone. */
const wordsOf = (text: string, locale: string, rules: Rules): string => {
  const { rest } = tokensWithoutTerms(text, locale, rules);
  return rest
    .replace(/[\p{P}\p{S}\p{N}\s]+/gu, " ")
    .trim()
    .toLowerCase();
};

const sameLanguage = (a: string, b: string, rules: Rules): boolean =>
  rules.locales[a]?.language === rules.locales[b]?.language;

/** One word may be a loanword or a label ("Sale"), so a line needs two to count. */
const hasWords = (words: string): boolean => words.split(" ").length > 1;

const applies = (master: string, locale: string, rules: Rules): boolean =>
  hasWords(master) && !sameLanguage(locale, rules.master_locale, rules);

export const checkUntranslated: LineCheck = (pair, ctx) => {
  const master = wordsOf(pair.masterText, ctx.rules.master_locale, ctx.rules);
  const same = master === wordsOf(pair.targetText, pair.locale, ctx.rules);
  const applicable = applies(master, pair.locale, ctx.rules);
  const rows: Row[] = applicable && same ? [[undefined, pair.targetText]] : [];
  return resultOf(ctx.rules, UNTRANSLATED, applicable, rows);
};
