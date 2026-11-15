import { describe, expect, it } from "vitest";
import { checkLanguageColumn, checkLanguageLine } from "../../../src/domain/checks/language.js";
import { stripForLanguage } from "../../../src/domain/checks/language-text.js";
import type { LocaleContext } from "../../../src/domain/checks/compare.js";
import type { Rules } from "../../../src/domain/rules.js";
import { aPair, ctx } from "../../support/builders.js";
import { describeLanguageDetectorContract } from "../../support/language-detector.contract.js";
import { FakeLanguageDetector } from "../../support/language-detector.js";
import { testLocale, testRules } from "../../support/rules.js";

const FR_LINES = ["Achetez maintenant et profitez de nos offres", "Livraison gratuite partout"];
const JA = "\u30c8\u30ec\u30a4\u30eb\u30b7\u30e5\u30fc\u30ba\u3092\u4eca\u3059\u3050\u8cfc\u5165";
const LONG_FR = "Profitez de nos offres exceptionnelles cette semaine";

const strip = (text: string): string => stripForLanguage(text, testRules(), testLocale("de-DE"));
const joined = (lines: string[]): string => lines.map((line) => strip(line)).join(". ");
const RETOURE = "Gratis Retoure";

/** A context of the real rules with some language rules changed. */
const withRules = (base: LocaleContext, over: Partial<Rules>): LocaleContext => ({
  ...base,
  rules: { ...testRules(), ...over },
});
const languageCheck = (over: Partial<Rules["language_check"]>) => ({
  language_check: { ...testRules().language_check, ...over },
});
const fake = (answers: Record<string, string | null>): FakeLanguageDetector =>
  new FakeLanguageDetector(answers);

describeLanguageDetectorContract((known) => new FakeLanguageDetector(known));

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
  it("an_unsure_detector_makes_an_unsure_warning_with_a_question", () => {
    const r = checkLanguageColumn(FR_LINES, ctx("de-DE", fake({})));
    expect(r.findings).toEqual([
      {
        check: "language_column",
        severity: "warning",
        confidence: "unsure",
        detail: "Couldn't confirm the de-DE column's language. Is it German?",
        expected: null,
        found: null,
      },
    ]);
  });
  it("a_short_column_read_as_another_language_is_unsure_not_a_blocker", () => {
    const r = checkLanguageColumn([RETOURE], ctx("de-DE", fake({ [RETOURE]: "fr" })));
    expect(r.findings).toEqual([
      {
        check: "language_column",
        severity: "warning",
        confidence: "unsure",
        detail: "The de-DE column is short and reads as French. Is it German?",
        expected: null,
        found: null,
      },
    ]);
  });
  it("the_short_column_bound_comes_from_rules", () => {
    const c = withRules(
      ctx("de-DE", fake({ [RETOURE]: "fr" })),
      languageCheck({ min_letters: 10 }),
    );
    expect(checkLanguageColumn([RETOURE], c).findings[0]).toMatchObject({
      severity: "blocker",
      confidence: "certain",
      detail: "The de-DE column reads as French.",
    });
  });
  it("the_unsure_severity_comes_from_rules", () => {
    const c = withRules(ctx("de-DE", fake({})), { unsure_severity: "info" });
    expect(checkLanguageColumn(FR_LINES, c).findings[0]).toMatchObject({
      severity: "info",
      confidence: "unsure",
    });
  });
  it("a_short_column_in_the_right_language_has_no_finding", () => {
    const r = checkLanguageColumn([RETOURE], ctx("de-DE", fake({ [RETOURE]: "de" })));
    expect(r).toEqual({ applicable: true, findings: [] });
  });
  it("japanese_text_in_a_latin_column_is_a_blocker", () => {
    const r = checkLanguageColumn([JA, JA], ctx("de-DE", fake({})));
    expect(r.findings[0]).toMatchObject({
      severity: "blocker",
      detail: "The de-DE column reads as Japanese.",
    });
  });
  it("an_empty_column_is_not_applicable", () => {
    expect(checkLanguageColumn(["{{a}}", "50%"], ctx("de-DE")).applicable).toBe(false);
  });
});

describe("language line", () => {
  it("short_lines_are_not_applicable", () => {
    expect(checkLanguageLine(aPair("Shop now", "Jetzt kaufen"), ctx()).applicable).toBe(false);
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
});
