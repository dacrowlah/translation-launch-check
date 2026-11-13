import type { LinePair, LocaleContext } from "../../src/domain/checks/compare";
import type { LanguageDetector } from "../../src/domain/ports/language-detector";
import { tokenize, type Tokens } from "../../src/domain/tokens/tokenize";
import type { LocalizationPackage, PackageLine } from "../../src/domain/types";
import { FAKE_NOW } from "./clock";
import { FakeLanguageDetector } from "./language-detector";
import { testRules } from "./rules";

const BASE_LINE: PackageLine = { id: "L1", channel: "email", field: "body", texts: {} };

export const aLine = (overrides: Partial<PackageLine> = {}): PackageLine => ({
  ...BASE_LINE,
  ...overrides,
});

const tokens = (text: string, locale: string): Tokens => tokenize(text, locale, testRules());

export const aPair = (
  master: string,
  target: string,
  locale = "de-DE",
  line: Partial<PackageLine> = {},
): LinePair => ({
  ...{ line: aLine(line), locale, masterText: master, targetText: target },
  master: tokens(master, "en-US"),
  target: tokens(target, locale),
});

export const ctx = (
  locale = "de-DE",
  detector: LanguageDetector = new FakeLanguageDetector({}),
): LocaleContext => ({ locale, rules: testRules(), today: FAKE_NOW, detector });

const DEFAULT_TEXTS = {
  "en-US": "Save big this season today",
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
