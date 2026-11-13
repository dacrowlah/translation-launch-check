import { describe, expect, it } from "vitest";
import { checkLocalization, type CheckDeps } from "../../src/application/check-localization";
import { ALL_CHECK_IDS } from "../../src/domain/types";
import { FakeClock } from "../support/clock";
import { aPackage, aLine } from "../support/builders";
import { FakeLanguageDetector } from "../support/language-detector";
import { testRules } from "../support/rules";

const deps = (answers: Record<string, string> = {}): CheckDeps => ({
  rules: testRules(),
  clock: new FakeClock(),
  detector: new FakeLanguageDetector(answers),
});
const DETECTED = {
  "Save big this season today": "en",
  "Sparen Sie in dieser Saison heute": "de",
  "Save big": "en",
  "Sparen Sie jetzt": "de",
};

describe("checkLocalization", () => {
  it("reports_every_check_id_per_locale", () => {
    const [locale] = checkLocalization(aPackage(), deps()).locales;
    expect(Object.keys(locale!.checks).sort()).toEqual([...ALL_CHECK_IDS].sort());
  });
  it("formality_is_not_applicable_for_ja", () => {
    const report = checkLocalization(aPackage({ locales: ["ja-JP"] }), deps());
    expect(report.locales[0]!.checks.formality).toBe("not_applicable");
  });
  it("keeps_input_order", () => {
    const report = checkLocalization(aPackage({ locales: ["fr-FR", "de-DE"] }), deps());
    expect(report.locales.map((l) => l.locale)).toEqual(["fr-FR", "de-DE"]);
  });
  it("reports_the_rules_version", () => {
    expect(checkLocalization(aPackage(), deps()).rules).toEqual({
      version: "1.0",
      effective_date: "2026-11-13",
    });
  });
  it("unknown_locale_is_a_status_not_a_throw", () => {
    const [locale] = checkLocalization(aPackage({ locales: ["it-IT"] }), deps()).locales;
    expect(locale).toEqual({
      ...{ locale: "it-IT", status: "unsupported_locale" },
      ...{ column_findings: [], lines: [], checks: {} },
    });
  });
  it("master_holds_only_the_two_language_checks", () => {
    const { master } = checkLocalization(aPackage(), deps(DETECTED));
    expect(Object.keys(master.checks).sort()).toEqual(["language_column", "language_line"]);
  });
  it("clean_package_has_no_findings_and_planted_one_has_a_blocker", () => {
    const planted = aLine({ texts: { "en-US": "Save 20% big", "de-DE": "Sparen Sie 25% jetzt" } });
    const found = (p = aPackage()) =>
      checkLocalization(p, deps(DETECTED)).locales[0]!.lines.flatMap((l) => l.findings);
    expect(found()).toEqual([]);
    expect(found(aPackage({ lines: [planted] })).map((f) => f.severity)).toContain("blocker");
  });
  it("reports_length_and_spelling_fix_per_line", () => {
    const line = aLine({ field: "body", texts: { "en-US": "Color sale", "en-GB": "Color sale" } });
    const [report] = checkLocalization(aPackage({ locales: ["en-GB"], lines: [line] }), deps())
      .locales[0]!.lines;
    expect(report).toMatchObject({
      length: { value: 10, limit: null, unit: "chars" },
      spelling_fix: "Colour sale",
    });
  });
  it("marks_a_check_verified_when_it_ran_on_a_line", () => {
    const report = checkLocalization(aPackage(), deps(DETECTED));
    expect(report.locales[0]!.checks).toMatchObject({
      formality: "verified",
      language_column: "verified",
    });
  });
});
