import type { Rules } from "../rules";
import { resultOf, type LinePair, type LineCheck, type Row, type Spec } from "./compare";
import { tokensWithoutTerms } from "./terms";
import { wholeWords } from "./words";

export const UNTRANSLATED_DETAIL = "The line is the same as the master.";

const UNTRANSLATED: Spec = { check: "untranslated", detail: UNTRANSLATED_DETAIL };

const lettersOf = (text: string): string =>
  text
    .replace(/[\p{P}\p{S}\p{N}\s]+/gu, " ")
    .trim()
    .toLowerCase();

/** The words left once terms, tags, URLs, codes, numbers, punctuation and loanwords are gone. */
const wordsOf = (text: string, locale: string, rules: Rules, loanwords: RegExp): string =>
  lettersOf(tokensWithoutTerms(text, locale, rules).rest.replace(loanwords, " "));

const languageOf = (locale: string, rules: Rules): string => rules.locales[locale]?.language ?? "";

const loanwordsFor = (locale: string, rules: Rules): RegExp =>
  wholeWords(rules.accepted_loanwords[languageOf(locale, rules)] ?? [], "giu");

const sides = (pair: LinePair, rules: Rules): [master: string, target: string] => {
  const loan = loanwordsFor(pair.locale, rules);
  return [
    wordsOf(pair.masterText, rules.master_locale, rules, loan),
    wordsOf(pair.targetText, pair.locale, rules, loan),
  ];
};

const otherLanguage = (locale: string, rules: Rules): boolean =>
  languageOf(locale, rules) !== languageOf(rules.master_locale, rules);

export const checkUntranslated: LineCheck = (pair, ctx) => {
  const [master, target] = sides(pair, ctx.rules);
  const applicable = otherLanguage(pair.locale, ctx.rules) && /\p{L}/u.test(master);
  const rows: Row[] = applicable && master === target ? [[undefined, pair.targetText]] : [];
  return resultOf(ctx.rules, UNTRANSLATED, applicable, rows);
};
