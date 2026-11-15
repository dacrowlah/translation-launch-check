import type { LocaleRule, Rules } from "../rules.js";
import { listOf } from "../tokens/per-language.js";
import { unique } from "../tokens/tally.js";
import { visibleText } from "./spans.js";
import { wholeWords } from "./words.js";

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/gu;
/** An apostrophe between letters belongs to the word ("l'offre", "aujourd\u2019hui"). */
const IN_WORD_APOSTROPHE = String.raw`(?<=\p{L})['\u2019](?=\p{L})`;
const NOT_LANGUAGE = new RegExp(String.raw`(?:[\p{N}\p{S}]|(?!${IN_WORD_APOSTROPHE})\p{P})+`, "gu");

const wordsOnly = (text: string): string =>
  text.replace(NOT_LANGUAGE, " ").replace(/\s+/gu, " ").trim();

/** The locale language's accepted loanwords ("sale", "shopping"), as whole words in any case. */
export const loanwordsOf = (rules: Rules, rule: LocaleRule): RegExp =>
  wholeWords(listOf(rules.accepted_loanwords, rule), "giu");

/**
 * The words of a line as a reader sees them, in the locale: no markup, links, emails, merge
 * tags, promo codes, do-not-translate terms, accepted loanwords, digits or symbols.
 */
export const stripForLanguage = (text: string, rules: Rules, rule: LocaleRule): string =>
  wordsOnly(visibleText(text.normalize("NFKC"), rules).replace(loanwordsOf(rules, rule), " "));

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

export const letterCount = (text: string): number => count(text, /\p{L}/gu);

export const japaneseShare = (text: string): number =>
  letterCount(text) === 0 ? 0 : count(text, JAPANESE) / letterCount(text);

/** The latin-script languages of every locale in the rules. */
export const candidateLanguages = (rules: Rules): string[] =>
  unique(
    Object.values(rules.locales)
      .filter((locale) => locale.script === "latin")
      .map((locale) => locale.language),
  );
