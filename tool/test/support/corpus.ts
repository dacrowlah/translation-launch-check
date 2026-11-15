import { readdirSync, readFileSync } from "node:fs";
import { checkLocalization } from "../../src/application/check-localization.js";
import type { CheckId, LineReport, LocalizationReport } from "../../src/domain/types.js";
import { aDeps, aLine, aPackage } from "./builders.js";
import { testRules } from "./rules.js";

/** The value checks the corpus compares; the line's spelling_fix joins them as a row. */
export const CORPUS_CHECKS: readonly CheckId[] = [
  "numbers",
  "currency_amount",
  "currency_code",
  "dates",
  "weekday_date_match",
  "merge_tags",
  "url_params",
  "url_path",
  "promo_codes",
];

type Values = [check: string, expected: string | null, found: string | null];
/**
 * [check, expected, found]: one certain finding; an unsure one adds "unsure" as a fourth value.
 * ["spelling_fix", null, the fixed line] is the line's spelling fix.
 */
export type CorpusFinding = Values | [...Values, "unsure"];
/** locale, master text, target text, and the findings the pair must give, in report order. */
export type CorpusRow = [string, string, string, CorpusFinding[]];
type Behaviours = Record<string, CorpusRow[]>;

const LOCALES = new Set(Object.keys(testRules().locales));

/** The one checked line of a one-locale report; anything else is a broken corpus row. */
const lineOf = (report: LocalizationReport): LineReport => {
  const [only, ...others] = report.locales;
  const line = only?.status === "checked" && only.lines.length === 1 ? only.lines[0] : undefined;
  if (line === undefined || others.length > 0) throw new Error("no single checked line");
  return line;
};

const findingsOf = (line: LineReport): CorpusFinding[] => {
  const kept = line.findings.filter((f) => CORPUS_CHECKS.includes(f.check));
  const rows = kept.map((f): CorpusFinding => {
    const values: Values = [f.check, f.expected, f.found];
    return f.confidence === "unsure" ? [...values, "unsure"] : values;
  });
  return line.spelling_fix ? [...rows, ["spelling_fix", null, line.spelling_fix]] : rows;
};

/** A target locale of the rules; a mistyped or master locale would check nothing. */
const targetLocale = (locale: string): string => {
  if (!LOCALES.has(locale) || locale === testRules().master_locale) {
    throw new Error(`not a target locale: ${locale}`);
  }
  return locale;
};

/** One line, master and target, through the whole use case on the real rules. */
export const valueFindings = (locale: string, master: string, target: string): CorpusFinding[] => {
  const texts = { [testRules().master_locale]: master, [targetLocale(locale)]: target };
  const pkg = aPackage({ locales: [locale], lines: [aLine({ texts })] });
  return findingsOf(lineOf(checkLocalization(pkg, aDeps())));
};

const DIR = new URL("../fixtures/regression/", import.meta.url);

/** The copy of every row, as locale, master and target. */
export const rowKeys = (groups: Behaviours): string[] =>
  Object.values(groups).flatMap((rows) => rows.map(([l, m, t]) => JSON.stringify([l, m, t])));

/** An empty group, or a key or a row written twice. */
const broken = (text: string, groups: Behaviours): boolean => {
  const [keys, copies] = [text.match(/^ {2}"[^"]+": \[/gmu) ?? [], rowKeys(groups)];
  const empty = Object.values(groups).some((rows) => rows.length === 0);
  return (
    empty || new Set(copies).size !== copies.length || keys.length !== Object.keys(groups).length
  );
};

/** The groups of one file; a broken file throws. */
export const corpusGroupsOf = (text: string): Behaviours => {
  const groups = JSON.parse(text) as Behaviours;
  if (broken(text, groups)) throw new Error("broken corpus file");
  return groups;
};

const areaOf = (file: string): [string, Behaviours] => [
  file.replace(/\.json$/u, ""),
  corpusGroupsOf(readFileSync(new URL(file, DIR), "utf8")),
];

/** Every corpus file (test/fixtures/regression/<area>.json): behaviour name to its rows. */
export const corpusAreas = (): [string, Behaviours][] =>
  readdirSync(DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(areaOf);
