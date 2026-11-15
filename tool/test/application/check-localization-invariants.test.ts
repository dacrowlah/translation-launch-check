import { describe, expect, it } from "vitest";
import { checkLocalization } from "../../src/application/check-localization.js";
import type { LocaleReport, LocalizationReport, PackageLine } from "../../src/domain/types.js";
import { aDeps, aLine, aPackage } from "../support/builders.js";

const LOCALES = ["de-DE", "fr-FR", "ja-JP", "en-GB"];
type Texts = [en: string, de: string, fr: string, ja: string, gb: string];

const lineOf = (id: string, channel: string, field: string, texts: Texts): PackageLine => {
  const codes = ["en-US", ...LOCALES];
  const pairs = codes.map((code, i): [string, string] => [code, texts[i] ?? ""]);
  return aLine({ id, channel, field, texts: Object.fromEntries(pairs) });
};

const SUBJECT_EN = "Black Friday: 30% off all jackets";
const CLEAN = [
  lineOf("L1", "email", "subject", [
    SUBJECT_EN,
    "Black Friday: 30 % auf alle Jacken",
    "Black Friday : -30 % sur les vestes",
    "Black Friday\uff1a\u5168\u30b8\u30e3\u30b1\u30c3\u30c830%\u30aa\u30d5",
    SUBJECT_EN,
  ]),
  lineOf("L2", "google_ads", "headline", [
    "30% off jackets",
    "30 % auf Jacken",
    "-30 % sur les vestes",
    "\u30b8\u30e3\u30b1\u30c3\u30c830%\u30aa\u30d5",
    "30% off jackets",
  ]),
  lineOf("L3", "sms", "body", [
    "TrailPro: 30% off ends Nov 29. Code BF26",
    "TrailPro: 30 % Rabatt bis 29. November. Code BF26",
    "TrailPro : -30 % jusqu'au 29 novembre. Code BF26",
    "TrailPro\uff1a11\u670829\u65e5\u307e\u306730%\u30aa\u30d5\u3002\u30b3\u30fc\u30c9BF26",
    "TrailPro: 30% off ends 29 Nov. Code BF26",
  ]),
];

/** An email-only campaign, so a length_hard row on a soft subject has no hard line to hide in. */
const PLANTED = [
  lineOf("L1", "email", "subject", [
    SUBJECT_EN,
    "Black Friday: 20 % Rabatt auf alle Jacken!",
    "Black Friday : -30 % sur toutes les vestes en stock",
    "Black Friday\uff1a\u5168\u30b8\u30e3\u30b1\u30c3\u30c820%\u30aa\u30d5",
    "Black Friday: 30% off all jackets and coats today",
  ]),
  lineOf("L2", "email", "preheader", [
    "",
    "Nur heute",
    "Aujourd'hui seulement",
    "\u672c\u65e5\u306e\u307f",
    "Today only",
  ]),
];

/** Each [locale, check] whose status is not_applicable but which has a finding in the report. */
const misfiled = (report: LocalizationReport): string[][] =>
  [report.master, ...report.locales].flatMap((locale: LocaleReport) => {
    const findings = [...locale.column_findings, ...locale.lines.flatMap((l) => l.findings)];
    const idle = findings.filter((f) => locale.checks[f.check] === "not_applicable");
    return idle.map((f) => [locale.locale, f.check]);
  });

const run = (lines: readonly PackageLine[]) =>
  checkLocalization(aPackage({ locales: LOCALES, lines }), aDeps());

describe("a check that does not apply carries no findings", () => {
  it.each([
    ["clean", CLEAN],
    ["planted", PLANTED],
  ])("no_finding_sits_under_a_not_applicable_check_in_the_%s_package", (_name, lines) => {
    expect(misfiled(run(lines))).toEqual([]);
  });
  it("the_planted_package_has_findings_to_check", () => {
    const report = run(PLANTED);
    const checks = report.locales.flatMap((l) =>
      l.lines.flatMap((x) => x.findings.map((f) => f.check)),
    );
    expect(checks).toEqual(expect.arrayContaining(["numbers", "length_soft"]));
  });
  it("an_over_long_subject_is_one_length_soft_warning", () => {
    const de = "Black Friday: 20 % Rabatt auf alle Jacken";
    const line = aLine({ field: "subject", texts: { "en-US": SUBJECT_EN, "de-DE": de } });
    const [report] = checkLocalization(aPackage({ lines: [line] }), aDeps()).locales;
    const findings = report?.lines.flatMap((l) => l.findings) ?? [];
    const length = findings.filter((f) => f.check.startsWith("length"));
    expect(length.map((f) => [f.check, f.severity, f.found])).toEqual([
      ["length_soft", "warning", "41"],
    ]);
  });
});
