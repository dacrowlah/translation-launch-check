import type { Tokens } from "../tokens/tokenize.js";
import {
  resultOf,
  type LinePair,
  type LineCheck,
  type LocaleContext,
  type Row,
  type Spec,
} from "./compare.js";
import { loanwordsOf } from "./language-text.js";
import { visibleText } from "./spans.js";

export const UNTRANSLATED_DETAIL = "The line is the same as the master.";

const UNTRANSLATED: Spec = { check: "untranslated", detail: UNTRANSLATED_DETAIL };

const lettersOf = (text: string): string =>
  text
    .replace(/[\p{P}\p{S}\p{N}\s]+/gu, " ")
    .trim()
    .toLowerCase();

/**
 * The visible words left once markup, terms, tags, URLs, codes, values, punctuation and
 * loanwords are gone (the tokens' rest has the values taken out).
 */
const wordsOf = (tokens: Tokens, loanwords: RegExp, ctx: LocaleContext): string =>
  lettersOf(visibleText(tokens.rest, ctx.rules).replace(loanwords, " "));

const sides = (pair: LinePair, ctx: LocaleContext): [master: string, target: string] => {
  const loan = loanwordsOf(ctx.rules, ctx.rule);
  return [wordsOf(pair.master, loan, ctx), wordsOf(pair.target, loan, ctx)];
};

const otherLanguage = (ctx: LocaleContext): boolean =>
  ctx.rule.language !== ctx.masterRule.language;

export const checkUntranslated: LineCheck = (pair, ctx) => {
  const [master, target] = sides(pair, ctx);
  const applicable = otherLanguage(ctx) && /\p{L}/u.test(master);
  const rows: Row[] = applicable && master === target ? [[undefined, pair.targetText]] : [];
  return resultOf(ctx.rules, UNTRANSLATED, applicable, rows);
};
