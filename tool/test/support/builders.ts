import type { CheckDeps } from "../../src/application/check-localization.js";
import type { LinePair, LocaleContext } from "../../src/domain/checks/compare.js";
import { rewriteVisible, visibleText } from "../../src/domain/checks/spans.js";
import { wholeWordSource } from "../../src/domain/checks/words.js";
import type { LanguageDetector } from "../../src/domain/ports/language-detector.js";
import type { LocaleRule, Rules } from "../../src/domain/rules.js";
import type { DateToken } from "../../src/domain/tokens/dates.js";
import { resolvePair } from "../../src/domain/tokens/resolve-pair.js";
import { usualTimes } from "../../src/domain/tokens/resolve-twelves.js";
import { extractTimes } from "../../src/domain/tokens/times.js";
import { readable, tokenize, type Tokens } from "../../src/domain/tokens/tokenize.js";
import { extractUrls } from "../../src/domain/tokens/urls.js";
import type { LocalizationPackage, PackageLine } from "../../src/domain/types.js";
import { FAKE_NOW, FakeClock } from "./clock.js";
import { FakeLanguageDetector } from "./language-detector.js";
import { testLocale, testRules } from "./rules.js";

const BASE_LINE: PackageLine = { id: "L1", channel: "email", field: "body", texts: {} };

export const aLine = (overrides: Partial<PackageLine> = {}): PackageLine => ({
  ...BASE_LINE,
  ...overrides,
});

/** One text tokenized for a locale of the real rules (not yet resolved against a pair). */
export const tokensOf = (locale: string, text: string): Tokens =>
  tokenize(text, testLocale(locale), testRules());

/** An extractor run on one text in a locale of the real rules: inLocale(extractDates)(l, t). */
export const inLocale =
  <T>(extract: (text: string, rule: LocaleRule, rules: Rules) => T) =>
  (locale: string, text: string): T =>
    extract(text, testLocale(locale), testRules());

/** The links of a text, as written (raw). */
export const linksIn = (text: string): string[] => extractUrls(text).urls.map((u) => u.raw);

/** The copy a reader sees, under the real rules (visibleText). */
export const visibleIn = (text: string): string => visibleText(text, testRules());

/**
 * Every clock time of a text, read as the tokenizer reads it (readable text): definite ones,
 * candidates, then two-way twelves by their default reading.
 */
export const timesIn = (locale: string, text: string): string[] => {
  const found = inLocale(extractTimes)(locale, readable(text));
  return [...found.times, ...found.candidates.map((c) => c.time), ...usualTimes(found.twelves)];
};

/** A fixed word table for the span tests: rewriteVisible without restating any spelling rule. */
const RESPELLED: Readonly<Record<string, string>> = {
  color: "colour",
  colors: "colours",
  center: "centre",
  centers: "centres",
  favorite: "favourite",
  favorites: "favourites",
};

const respell = (word: string): string => RESPELLED[word.toLowerCase()] ?? word;

/** Each RESPELLED word in the visible copy rewritten; every protected span stays as written. */
export const respelled = (text: string, rules: Rules = testRules()): string =>
  rewriteVisible(text, rules, wholeWordSource(Object.keys(RESPELLED)), respell);

/** A date token, yearless and without a weekday unless given. */
export const aDate = (date: Pick<DateToken, "month" | "day"> & Partial<DateToken>): DateToken => ({
  year: null,
  weekday: null,
  ...date,
});

export const ctx = (
  locale = "de-DE",
  detector: LanguageDetector = new FakeLanguageDetector({}),
): LocaleContext => {
  const [rules, rule] = [testRules(), testLocale(locale)];
  const masterRule = testLocale(rules.master_locale);
  return { locale, rule, masterRule, rules, today: FAKE_NOW, detector };
};

/** Both sides tokenized (each in its own locale) and resolved against each other, as the use case does. */
const sidesOf = (masterText: string, targetText: string, locale: string) => {
  const masterTokens = tokensOf(testRules().master_locale, masterText);
  const [master, target] = resolvePair(masterTokens, tokensOf(locale, targetText));
  return { master, target, masterText, targetText };
};

export const aPair = (
  master: string,
  target: string,
  locale = "de-DE",
  line: Partial<PackageLine> = {},
): LinePair => ({ ...sidesOf(master, target, locale), line: aLine(line), locale });

/** The use case's dependencies: the real rules, a fixed clock, a scripted detector. */
export const aDeps = (answers: Record<string, string> = {}): CheckDeps => ({
  rules: testRules(),
  clock: new FakeClock(),
  detector: new FakeLanguageDetector(answers),
});

const DEFAULT_TEXTS = {
  [testRules().master_locale]: "Save big this season today",
  "de-DE": "Sparen Sie in dieser Saison heute",
};

const BASE_PACKAGE: LocalizationPackage = {
  campaign: "Spring Sale",
  master_locale: "en-US",
  locales: ["de-DE"],
  lines: [aLine({ texts: DEFAULT_TEXTS })],
};

export const aPackage = (overrides: Partial<LocalizationPackage> = {}): LocalizationPackage => ({
  ...BASE_PACKAGE,
  ...overrides,
});
