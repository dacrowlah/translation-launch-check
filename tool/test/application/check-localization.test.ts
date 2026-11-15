import { describe, expect, it } from "vitest";
import { checkLocalization, type CheckDeps } from "../../src/application/check-localization";
import { ALL_CHECK_IDS, type LocaleReport } from "../../src/domain/types";
import { aDeps, aPackage, aLine } from "../support/builders";
import { testRules } from "../support/rules";

const VALUE_CHECKS = ["dates", "weekday_date_match", "currency_amount", "currency_code"];
/** The date and price findings of a report: none when "Fr. 27.11.: 29 $" is read right in de-DE. */
const dateAndPriceFindings = (report?: LocaleReport) =>
  report?.lines.flatMap((l) => l.findings).filter((f) => VALUE_CHECKS.includes(f.check));
const DETECTED = {
  "Save big this season today": "en",
  "Sparen Sie in dieser Saison heute": "de",
  "Save big": "en",
  "Sparen Sie jetzt": "de",
};

describe("checkLocalization", () => {
  it("reports_every_check_id_per_locale", () => {
    const [locale] = checkLocalization(aPackage(), aDeps()).locales;
    expect(Object.keys(locale!.checks).sort()).toEqual([...ALL_CHECK_IDS].sort());
  });
  it("formality_is_not_applicable_for_ja", () => {
    const report = checkLocalization(aPackage({ locales: ["ja-JP"] }), aDeps());
    expect(report.locales[0]!.checks.formality).toBe("not_applicable");
  });
  it("keeps_input_order", () => {
    const report = checkLocalization(aPackage({ locales: ["fr-FR", "de-DE"] }), aDeps());
    expect(report.locales.map((l) => l.locale)).toEqual(["fr-FR", "de-DE"]);
  });
  it("reports_the_rules_version", () => {
    expect(checkLocalization(aPackage(), aDeps()).rules).toEqual({
      version: "1.0",
      effective_date: "2026-11-13",
    });
  });
  it("unknown_locale_is_a_status_not_a_throw", () => {
    const [locale] = checkLocalization(aPackage({ locales: ["it-IT"] }), aDeps()).locales;
    const unsupported = { locale: "it-IT", status: "unsupported_locale" };
    expect(locale).toEqual({ ...unsupported, column_findings: [], lines: [], checks: {} });
  });
  it("master_holds_only_the_two_language_checks", () => {
    const { master } = checkLocalization(aPackage(), aDeps(DETECTED));
    expect(Object.keys(master.checks).sort()).toEqual(["language_column", "language_line"]);
  });
  it("clean_package_has_no_findings_and_planted_one_has_a_blocker", () => {
    const planted = aLine({ texts: { "en-US": "Save 20% big", "de-DE": "Sparen Sie 25% jetzt" } });
    const found = (p = aPackage()) =>
      checkLocalization(p, aDeps(DETECTED)).locales[0]!.lines.flatMap((l) => l.findings);
    expect(found()).toEqual([]);
    expect(found(aPackage({ lines: [planted] })).map((f) => f.severity)).toContain("blocker");
  });
  it("reports_length_and_spelling_fix_per_line", () => {
    const line = aLine({ field: "body", texts: { "en-US": "Color sale", "en-GB": "Color sale" } });
    const [report] = checkLocalization(aPackage({ locales: ["en-GB"], lines: [line] }), aDeps())
      .locales[0]!.lines;
    expect(report).toMatchObject({
      length: { value: 10, limit: null, unit: "chars" },
      spelling_fix: "Colour sale",
    });
  });
  it("a_de_de_report_does_not_depend_on_de_ch_in_the_same_call", () => {
    const de = "Fr. 27.11.: 29 $";
    const texts = { "en-US": "Friday, Nov 27: $29", "de-DE": de, "de-CH": de };
    const report = (locales: string[]) => {
      const fresh: CheckDeps = { ...aDeps(), rules: { ...testRules() } };
      const pkg = aPackage({ locales, lines: [aLine({ texts })] });
      return checkLocalization(pkg, fresh).locales.find((l) => l.locale === "de-DE");
    };
    const alone = report(["de-DE"]);
    expect([alone?.status, dateAndPriceFindings(alone)]).toEqual(["checked", []]);
    expect([report(["de-CH", "de-DE"]), report(["de-DE", "de-CH"])]).toEqual([alone, alone]);
  });
  it("marks_a_check_verified_when_it_ran_on_a_line", () => {
    const report = checkLocalization(aPackage(), aDeps(DETECTED));
    expect(report.locales[0]!.checks).toMatchObject({
      formality: "verified",
      language_column: "verified",
    });
  });
});
