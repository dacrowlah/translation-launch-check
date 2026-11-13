import { describe, expect, it } from "vitest";
import { checkLanguageColumn, checkLanguageLine } from "../../../src/domain/checks/language";
import {
  candidateLanguages,
  japaneseShare,
  letterCount,
  stripForLanguage,
} from "../../../src/domain/checks/language-text";
import { aPair, ctx } from "../../support/builders";
import { describeLanguageDetectorContract } from "../../support/language-detector.contract";
import { FakeLanguageDetector } from "../../support/language-detector";
import { testRules } from "../../support/rules";

const FR_LINES = ["Achetez maintenant et profitez de nos offres", "Livraison gratuite partout"];
const JA = "\u30c8\u30ec\u30a4\u30eb\u30b7\u30e5\u30fc\u30ba\u3092\u4eca\u3059\u3050\u8cfc\u5165";
const LONG_FR = "Profitez de nos offres exceptionnelles cette semaine";

const strip = (text: string): string => stripForLanguage(text, testRules());
const joined = (lines: string[]): string => lines.map(strip).join(". ");
const fake = (answers: Record<string, string | null>): FakeLanguageDetector =>
  new FakeLanguageDetector(answers);

describeLanguageDetectorContract((known) => new FakeLanguageDetector(known));

describe("language text", () => {
  it("strips_tags_urls_codes_terms_numbers_and_symbols", () => {
    const text = "Shop {{first_name}} https://a.com/x SAVE20 TrailPro 50% off!";
    expect(strip(text)).toBe("Shop off");
  });
  it("counts_letters_and_japanese_share", () => {
    expect(letterCount("ab 12 \u3042")).toBe(3);
    expect(japaneseShare("ab\u3042\u30a2")).toBe(0.5);
    expect(japaneseShare("123")).toBe(0);
  });
  it("candidates_are_the_latin_languages_of_every_locale", () => {
    expect(candidateLanguages(testRules()).sort()).toEqual(["de", "en", "fr"]);
  });
});

describe("language column", () => {
  it("french_in_the_german_column_is_a_blocker", () => {
    const r = checkLanguageColumn(FR_LINES, ctx("de-DE", fake({ [joined(FR_LINES)]: "fr" })));
    expect(r.findings[0]).toMatchObject({
      check: "language_column",
      severity: "blocker",
      detail: "The de-DE column reads as French.",
    });
  });
  it("the_right_language_is_applicable_with_no_finding", () => {
    const r = checkLanguageColumn(FR_LINES, ctx("fr-FR", fake({ [joined(FR_LINES)]: "fr" })));
    expect(r).toEqual({ applicable: true, findings: [] });
  });
  it("unsure_column_is_a_warning", () => {
    const r = checkLanguageColumn(FR_LINES, ctx("de-DE", fake({})));
    expect(r.findings[0]).toMatchObject({
      check: "language_column",
      severity: "warning",
      detail: "Couldn't confirm the de-DE column's language.",
    });
  });
  it("japanese_text_in_a_latin_column_is_a_blocker", () => {
    const r = checkLanguageColumn([JA, JA], ctx("de-DE", fake({})));
    expect(r.findings[0]).toMatchObject({
      severity: "blocker",
      detail: "The de-DE column reads as Japanese.",
    });
  });
  it("a_japanese_column_needs_japanese", () => {
    const bad = checkLanguageColumn(FR_LINES, ctx("ja-JP"));
    expect(bad.findings[0]).toMatchObject({ severity: "blocker" });
    expect(checkLanguageColumn([JA], ctx("ja-JP")).findings).toEqual([]);
  });
  it("an_empty_column_is_not_applicable", () => {
    expect(checkLanguageColumn(["{{a}}", "50%"], ctx("de-DE")).applicable).toBe(false);
  });
});

describe("language line", () => {
  it("short_lines_are_not_applicable", () => {
    expect(checkLanguageLine(aPair("Shop now", "Jetzt kaufen"), ctx()).applicable).toBe(false);
  });
  it("brand_only_japanese_line_is_not_applicable", () => {
    const pair = aPair("Black Friday SALE", "Black Friday SALE", "ja-JP");
    expect(checkLanguageLine(pair, ctx("ja-JP")).applicable).toBe(false);
  });
  it("a_long_line_in_another_language_is_a_warning", () => {
    const c = ctx("de-DE", fake({ [strip(LONG_FR)]: "fr" }));
    expect(checkLanguageLine(aPair("Hi", LONG_FR), c).findings[0]).toMatchObject({
      check: "language_line",
      severity: "warning",
      detail: "This line reads as French.",
    });
  });
  it("a_long_line_in_the_right_language_has_no_finding", () => {
    const c = ctx("fr-FR", fake({ [strip(LONG_FR)]: "fr" }));
    expect(checkLanguageLine(aPair("Hi", LONG_FR, "fr-FR"), c)).toEqual({
      applicable: true,
      findings: [],
    });
  });
  it("an_unsure_long_line_is_not_applicable", () => {
    expect(checkLanguageLine(aPair("Hi", LONG_FR), ctx("de-DE", fake({}))).applicable).toBe(false);
  });
  it("japanese_in_a_latin_line_is_a_warning_even_when_short", () => {
    expect(checkLanguageLine(aPair("Hi", JA), ctx("de-DE")).findings[0]).toMatchObject({
      detail: "This line reads as Japanese.",
    });
  });
  it("a_japanese_line_without_japanese_is_a_warning_when_long", () => {
    const pair = aPair("Hi", LONG_FR, "ja-JP");
    expect(checkLanguageLine(pair, ctx("ja-JP")).findings[0]).toMatchObject({
      detail: "This line has no Japanese characters.",
    });
    expect(checkLanguageLine(aPair("Hi", JA, "ja-JP"), ctx("ja-JP")).findings).toEqual([]);
  });
});
