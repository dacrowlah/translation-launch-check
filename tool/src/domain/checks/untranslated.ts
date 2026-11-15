import { listOf } from "../tokens/per-language.js";
import type { Tokens } from "../tokens/tokenize.js";
import {
  resultOf,
  type LinePair,
  type LineCheck,
  type LocaleContext,
  type Row,
  type Spec,
} from "./compare.js";
import { wholeWords } from "./words.js";

export const UNTRANSLATED_DETAIL = "The line is the same as the master.";

const UNTRANSLATED: Spec = { check: "untranslated", detail: UNTRANSLATED_DETAIL };

const lettersOf = (text: string): string =>
  text
    .replace(/[\p{P}\p{S}\p{N}\s]+/gu, " ")
    .trim()
    .toLowerCase();

/** The words left once terms, tags, URLs, codes, numbers, punctuation and loanwords are gone. */
const wordsOf = (tokens: Tokens, loanwords: RegExp): string =>
  lettersOf(tokens.rest.replace(loanwords, " "));

const loanwordsFor = (ctx: LocaleContext): RegExp =>
  wholeWords(listOf(ctx.rules.accepted_loanwords, ctx.rule), "giu");

const sides = (pair: LinePair, ctx: LocaleContext): [master: string, target: string] => {
  const loan = loanwordsFor(ctx);
  return [wordsOf(pair.master, loan), wordsOf(pair.target, loan)];
};

const otherLanguage = (ctx: LocaleContext): boolean =>
  ctx.rule.language !== ctx.masterRule.language;

export const checkUntranslated: LineCheck = (pair, ctx) => {
  const [master, target] = sides(pair, ctx);
  const applicable = otherLanguage(ctx) && /\p{L}/u.test(master);
  const rows: Row[] = applicable && master === target ? [[undefined, pair.targetText]] : [];
  return resultOf(ctx.rules, UNTRANSLATED, applicable, rows);
};
