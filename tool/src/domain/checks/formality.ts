import type { Lexicon, Rules } from "../rules";
import type { CheckResult } from "../types";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";
import { withoutSpans } from "./spans";

export const FORMALITY_DETAIL = "The line uses the informal register in a formal locale.";

const FORMALITY: Spec = { check: "formality", detail: FORMALITY_DETAIL };

const WORDS = (text: string): string[] => text.match(/\p{L}+/gu) ?? [];

const unique = (items: readonly string[]): string[] => [...new Set(items)];

const marked = (words: readonly string[], markers: readonly string[]): string[] =>
  unique(words.filter((word) => markers.includes(word)));

const rowsOf = (informal: readonly string[]): Row[] =>
  informal.length === 0 ? [] : [["formal", informal.join(", ")]];

const verdict = (words: readonly string[], lexicon: Lexicon, rules: Rules): CheckResult => {
  const [formal, informal] = [marked(words, lexicon.formal), marked(words, lexicon.informal)];
  return resultOf(rules, FORMALITY, formal.length + informal.length > 0, rowsOf(informal));
};

export const checkFormality: LineCheck = (pair, ctx) => {
  const rule = ctx.rules.locales[pair.locale];
  const lexicon = ctx.rules.formality_markers[rule?.language ?? ""];
  if (rule?.formality !== "formal" || !lexicon) return resultOf(ctx.rules, FORMALITY, false, []);
  return verdict(WORDS(withoutSpans(pair.targetText, ctx.rules)), lexicon, ctx.rules);
};
