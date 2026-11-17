import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkLocalization } from "../../src/application/check-localization.js";
import type {
  Finding,
  LineReport,
  LocaleReport,
  LocalizationPackage,
  LocalizationReport,
} from "../../src/domain/types.js";
import { EldLanguageDetector } from "../../src/infrastructure/eld-detector.js";
import { FakeClock } from "../support/clock.js";
import { testRules } from "../support/rules.js";

/**
 * The demo files the owner runs live, through the real use case: the real rules, the real
 * language detector and the fake clock. The packages are the CSVs as the workflow parses
 * them (`python scripts/write_demo_fixtures.py`; mark/tests pins them as current).
 */
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;

const demo = (stem: string): LocalizationPackage =>
  readJson(`../fixtures/demo/${stem}.package.json`);

const detector = new EldLanguageDetector();

const run = (stem: string): LocalizationReport =>
  checkLocalization(demo(stem), { rules: testRules(), clock: new FakeClock(), detector });

type Row = [string, string, string, string, string, string | null, string | null];

const rowOf = (locale: string, line: string, f: Finding): Row => [
  locale,
  line,
  f.check,
  f.severity,
  f.confidence,
  f.expected,
  f.found,
];

const localeRows = ({ locale, column_findings, lines }: LocaleReport): Row[] => [
  ...column_findings.map((f) => rowOf(locale, "column", f)),
  ...lines.flatMap((line) => line.findings.map((f) => rowOf(locale, line.id, f))),
];

/** Every finding, the master first, as [locale, line id or "column", check, severity,
 * confidence, expected, found]. */
const findingRows = (report: LocalizationReport): Row[] =>
  [report.master, ...report.locales].flatMap(localeRows);

/** Each locale's status, the master first. */
const statuses = (report: LocalizationReport): string[] =>
  [report.master, ...report.locales].map((locale) => `${locale.locale} ${locale.status}`);

const lineOf = (report: LocalizationReport, locale: string, id: string): LineReport | undefined =>
  report.locales.find((l) => l.locale === locale)?.lines.find((line) => line.id === id);

type Fix = [locale: string, line: string, fixed: string];

/** Every code-made spelling fix, as [locale, line id, the corrected line]. */
const fixes = (report: LocalizationReport): Fix[] =>
  report.locales.flatMap(({ locale, lines }) =>
    lines.flatMap(({ id, spelling_fix }): Fix[] =>
      spelling_fix ? [[locale, id, spelling_fix]] : [],
    ),
  );

const CHECKED = ["en-US checked", "de-DE checked", "fr-FR checked", "ja-JP checked"];

interface Answer {
  readonly locale: string;
  readonly line_id: string;
  readonly check: string;
}

/** The seeded set's answer key, less the reviewer's entries (check "claim"). */
const ruleAnswers = (): Answer[] =>
  readJson<Answer[]>("../../../demo/seeded-errors.answers.json").filter(
    (answer) => answer.check !== "claim",
  );

const asAnswers = (rows: readonly Row[]): Answer[] =>
  rows.map(([locale, line_id, check]) => ({ locale, line_id, check }));

/** The planted errors a rule can see; the changed and added claims are Translation Review's. */
const ERRORS_FILE_FINDINGS: Row[] = [
  ["de-DE", "L1", "numbers", "blocker", "certain", "30%", "20%"],
  ["de-DE", "L2", "dates", "blocker", "certain", "11/29 Sun", "11/30 Mon"],
  ["de-DE", "L2", "merge_tags", "blocker", "certain", "{{first_name}}", "{{vorname}}"],
  ["de-DE", "L2", "formality", "warning", "certain", "formal", "dir"],
  ["fr-FR", "L2", "url_params", "blocker", "certain", "utm_campaign=bf26", null],
  ["fr-FR", "L2", "glossary_forbidden", "blocker", "certain", null, "garanti"],
  ["ja-JP", "L5", "glossary_dnt", "warning", "certain", "TrailPro", null],
];

const UK_CH_FINDINGS: Row[] = [
  [
    "en-GB",
    "L2",
    "locale_spelling",
    "warning",
    "certain",
    "favourite, colours",
    "favorite, colors",
  ],
  ["en-GB", "L5", "locale_spelling", "warning", "certain", "Organise", "Organize"],
  ["de-CH", "L2", "locale_spelling", "warning", "certain", "Gr\u00fcsse", "Gr\u00fc\u00dfe"],
  ["de-CH", "L4", "locale_spelling", "warning", "certain", "Bahnhofstrasse", "Bahnhofstra\u00dfe"],
  ["de-CH", "L5", "currency_code", "warning", "certain", "USD", "CHF"],
];

const UK_CH_FIXES: Fix[] = [
  [
    "en-GB",
    "L2",
    "Hi {{first_name}}, find your favourite colours in our Black Friday sale. Free returns until Sunday 29 November. Best wishes, the TrailPro team",
  ],
  ["en-GB", "L5", "Organise your winter gear: TrailPro jackets from $49.90."],
  [
    "de-CH",
    "L2",
    "Hallo {{first_name}}, finden Sie Ihre Lieblingsfarben in unserem Black Friday Sale. Kostenlose R\u00fccksendung bis Sonntag, 29. November. Freundliche Gr\u00fcsse, Ihr TrailPro-Team",
  ],
  ["de-CH", "L4", "Besuchen Sie unseren neuen Laden an der Bahnhofstrasse in Z\u00fcrich."],
];

/** The seeded set's rule errors: the answer key's rule entries, each at its severity. */
const SEEDED_FINDINGS: Row[] = [
  ["de-DE", "S4", "dates", "blocker", "certain", "11/30", "12/1"],
  ["de-DE", "S5", "glossary_forbidden", "blocker", "certain", null, "garantiert"],
  ["de-DE", "S8", "length_hard", "blocker", "certain", "30", "43"],
  ["fr-FR", "S1", "glossary_dnt", "warning", "certain", "Black Friday", null],
  ["fr-FR", "S2", "weekday_date_match", "warning", "certain", "11/26 Thu", "11/26 Fri"],
  ["fr-FR", "S6", "currency_amount", "blocker", "certain", "25.00 USD", "20.00 USD"],
  ["fr-FR", "S9", "untranslated", "warning", "certain", null, "Find your size"],
  ["ja-JP", "S3", "merge_tags", "blocker", "certain", "{{first_name}}", "{{\u540d\u524d}}"],
  ["ja-JP", "S4", "promo_codes", "blocker", "certain", "BF30", "BF20"],
  ["ja-JP", "S5", "trademark_symbols", "warning", "certain", "\u00ae", null],
  ["ja-JP", "S7", "time_zone", "warning", "certain", null, "11\u6642"],
  ["en-GB", "S1", "numbers", "blocker", "certain", "30%", "40%"],
  ["en-GB", "S9", "template_leftovers", "blocker", "certain", null, "Translated text:"],
  ["de-CH", "S3", "url_params", "blocker", "certain", "utm_source=email", null],
  ["de-CH", "S5", "markup", "blocker", "certain", "</b>", null],
  ["de-CH", "S6", "language_line", "warning", "certain", null, null],
  ["de-CH", "S10", "formality", "warning", "certain", "formal", "du"],
];

const SEEDED_LOCALES = ["de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH"];

/** Each locale's status and every finding: a skipped locale would show no findings either. */
const outcome = (stem: string): [string[], Row[]] => {
  const report = run(stem);
  return [statuses(report), findingRows(report)];
};

describe("demo files through the real tool", () => {
  it("the_clean_file_has_no_finding_in_any_locale", () => {
    expect(outcome("black-friday-clean")).toEqual([CHECKED, []]);
  });

  it("the_errors_file_gives_exactly_the_planted_rule_errors", () => {
    expect(outcome("black-friday-launch")).toEqual([CHECKED, ERRORS_FILE_FINDINGS]);
  });

  it("the_japanese_headline_fits_at_28_of_30_double_width_characters", () => {
    expect(lineOf(run("black-friday-launch"), "ja-JP", "L3")).toEqual({
      id: "L3",
      length: { value: 28, limit: 30, unit: "ads_chars" },
      findings: [],
      spelling_fix: null,
    });
  });

  it("the_uk_ch_file_gives_spelling_and_currency_warnings_only", () => {
    expect(outcome("black-friday-uk-ch")).toEqual([
      ["en-US checked", "en-GB checked", "de-CH checked"],
      UK_CH_FINDINGS,
    ]);
  });

  it("the_uk_ch_file_has_a_code_made_fix_for_each_misspelt_line", () => {
    expect(fixes(run("black-friday-uk-ch"))).toEqual(UK_CH_FIXES);
  });

  it("the_encoding_demo_campaign_has_no_finding_in_any_locale", () => {
    expect(outcome("1-campaign-utf8")).toEqual([CHECKED, []]);
  });

  it("the_seeded_rule_errors_are_all_caught_and_nothing_else_is_flagged", () => {
    expect(outcome("seeded-errors")).toEqual([
      ["en-US checked", ...SEEDED_LOCALES.map((locale) => `${locale} checked`)],
      SEEDED_FINDINGS,
    ]);
  });

  it("the_seeded_findings_are_exactly_the_answer_keys_rule_entries", () => {
    expect(asAnswers(SEEDED_FINDINGS)).toEqual(ruleAnswers());
  });
});
