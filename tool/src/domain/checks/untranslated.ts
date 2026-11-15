import type { LocaleRule, Rules } from "../rules";
import { listOf } from "../tokens/per-language";
import {
  resultOf,
  type LinePair,
  type LineCheck,
  type LocaleContext,
  type Row,
  type Spec,
} from "./compare";
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
const wordsOf = (text: string, rule: LocaleRule, rules: Rules, loanwords: RegExp): string =>
  lettersOf(tokensWithoutTerms(text, rule, rules).rest.replace(loanwords, " "));

const loanwordsFor = (ctx: LocaleContext): RegExp =>
  wholeWords(listOf(ctx.rules.accepted_loanwords, ctx.rule), "giu");

const sides = (pair: LinePair, ctx: LocaleContext): [master: string, target: string] => {
  const loan = loanwordsFor(ctx);
  return [
    wordsOf(pair.masterText, ctx.masterRule, ctx.rules, loan),
    wordsOf(pair.targetText, ctx.rule, ctx.rules, loan),
  ];
};

const otherLanguage = (ctx: LocaleContext): boolean =>
  ctx.rule.language !== ctx.masterRule.language;

export const checkUntranslated: LineCheck = (pair, ctx) => {
  const [master, target] = sides(pair, ctx);
  const applicable = otherLanguage(ctx) && /\p{L}/u.test(master);
  const rows: Row[] = applicable && master === target ? [[undefined, pair.targetText]] : [];
  return resultOf(ctx.rules, UNTRANSLATED, applicable, rows);
};
