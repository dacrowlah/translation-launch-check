import type { Rules } from "../rules.js";
import { promoPattern } from "../tokens/promo-codes.js";
import { unique } from "../tokens/tally.js";
import { dntPattern } from "../tokens/terms.js";
import { withoutSpans } from "./spans.js";

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/gu;
const NOT_LANGUAGE = /[\p{N}\p{P}\p{S}]+/gu;

const wordsOnly = (text: string): string =>
  text.replace(NOT_LANGUAGE, " ").replace(/\s+/gu, " ").trim();

/** The words of a line: no tags, URLs, promo codes, do-not-translate terms, digits or symbols. */
export const stripForLanguage = (text: string, rules: Rules): string =>
  wordsOnly(
    withoutSpans(text.normalize("NFKC"), rules)
      .replace(promoPattern(rules), " ")
      .replace(dntPattern(rules), " "),
  );

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
