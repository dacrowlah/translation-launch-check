import { describe, expect, it } from "vitest";
import { checkLocalization } from "../../src/application/check-localization.js";
import type { LocalizationPackage, LocaleReport } from "../../src/domain/types.js";
import { aDeps, aLine, aPackage } from "../support/builders.js";

const line = (id: string, en: string, de: string) =>
  aLine({ id, texts: { "en-US": en, "de-DE": de } });
const de = (lines: LocalizationPackage["lines"]): LocaleReport =>
  checkLocalization(aPackage({ lines }), aDeps()).locales[0]!;

describe("checkLocalization lines", () => {
  it("plants_a_defect_on_the_second_line_and_finds_only_it", () => {
    const report = de([
      line("L1", "Save big", "Sparen Sie jetzt"),
      line("L2", "Save 20% big", "Sparen Sie 25% jetzt"),
    ]);
    const [first, second] = report.lines;
    expect(first!.findings.filter((f) => f.check === "numbers")).toEqual([]);
    expect(second).toMatchObject({ id: "L2" });
    expect(second!.findings[0]).toMatchObject({ check: "numbers", severity: "blocker" });
  });
  it("a_pair_can_split_into_verified_and_not_applicable", () => {
    const { checks } = de([line("L1", "Ends on June 5", "Endet am 5. Juni")]);
    expect(checks).toMatchObject({ dates: "verified", weekday_date_match: "not_applicable" });
  });
  it("reordered_tags_urls_dates_and_grouped_amounts_are_clean", () => {
    const en =
      "{{a}} {{b}} https://x.com/p?utm_source=a&utm_medium=b June 5 and June 7 EUR 1,299.00";
    const d =
      "{{b}} {{a}} https://x.com/p?utm_medium=b&utm_source=a 7. Juni und 5. Juni 1.299,00 EUR";
    const checks = ["numbers", "currency_amount", "merge_tags", "url_params", "dates"];
    const found = de([line("L1", en, d)]).lines[0]!.findings.map((f) => f.check);
    expect(found.filter((c) => checks.includes(c))).toEqual([]);
  });
  it("keeps_line_input_order", () => {
    const [a, b] = [line("L1", "Save", "Sparen"), line("L2", "Buy", "Kaufen")];
    expect(de([a, b]).lines.map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(de([b, a]).lines.map((l) => l.id)).toEqual(["L2", "L1"]);
  });
  it("orders_findings_by_the_check_table", () => {
    const text = line("L1", "Save 20% {{a}}", "Sparen 25%");
    const checks = de([text]).lines[0]!.findings.map((f) => f.check);
    expect(checks.filter((c) => c === "numbers" || c === "merge_tags")).toEqual([
      "numbers",
      "merge_tags",
    ]);
  });
  it("spelling_fix_is_the_line_the_spelling_finding_describes", () => {
    const lines = [aLine({ texts: { "en-US": "Gray colors", "en-GB": "Gray colors" } })];
    const [line] = checkLocalization(aPackage({ locales: ["en-GB"], lines }), aDeps()).locales[0]!
      .lines;
    const spelling = line!.findings.filter((f) => f.check === "locale_spelling");
    expect(spelling.map((f) => [f.expected, f.found])).toEqual([["Grey, colours", "Gray, colors"]]);
    expect(line!.spelling_fix).toBe("Grey colours");
  });
  it("spelling_fix_is_null_when_nothing_changes", () => {
    const texts = { "en-US": "Great sale", "en-GB": "Great sale" };
    const lines = [aLine({ texts })];
    const report = checkLocalization(aPackage({ locales: ["en-GB"], lines }), aDeps());
    expect(report.locales[0]!.lines[0]!.spelling_fix).toBe(null);
  });
});
