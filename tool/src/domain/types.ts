export type Severity = "blocker" | "warning" | "info";
export type CheckStatus = "verified" | "not_applicable";

export const ALL_CHECK_IDS = [
  "numbers",
  "currency_amount",
  "currency_code",
  "dates",
  "weekday_date_match",
  "merge_tags",
  "url_params",
  "url_path",
  "promo_codes",
  "template_leftovers",
  "length_hard",
  "length_soft",
  "formality",
  "glossary_forbidden",
  "glossary_dnt",
  "untranslated",
  "language_column",
  "language_line",
  "typography",
  "length_ratio",
  "trademark_symbols",
  "markup",
  "time_zone",
  "locale_spelling",
] as const;
export type CheckId = (typeof ALL_CHECK_IDS)[number];

export interface Finding {
  readonly check: CheckId;
  readonly severity: Severity;
  readonly detail: string;
  readonly expected: string | null;
  readonly found: string | null;
}
export interface PackageLine {
  readonly id: string;
  readonly channel: string;
  readonly field: string;
  readonly texts: Readonly<Record<string, string>>;
}
export interface LocalizationPackage {
  readonly campaign: string;
  /** The rules' master_locale; the tool's input schema checks it. */
  readonly master_locale: string;
  readonly locales: readonly string[];
  readonly lines: readonly PackageLine[];
}
export type Unit = "chars" | "ads_chars" | "sms_segments";
export interface LengthInfo {
  readonly value: number;
  readonly limit: number | null;
  readonly unit: Unit;
}
export interface LineReport {
  readonly id: string;
  readonly length: LengthInfo | null;
  readonly findings: readonly Finding[];
  readonly spelling_fix: string | null; // corrected line, built by code
}
export interface LocaleReport {
  readonly locale: string;
  readonly status: "checked" | "unsupported_locale";
  readonly column_findings: readonly Finding[];
  readonly lines: readonly LineReport[];
  readonly checks: Readonly<Partial<Record<CheckId, CheckStatus>>>;
}
export interface RulesVersion {
  readonly version: string;
  readonly effective_date: string;
}
export interface LocalizationReport {
  readonly rules: RulesVersion;
  readonly master: LocaleReport;
  readonly locales: readonly LocaleReport[];
}
/** What one check returns for one line or column. applicable=false -> "not_applicable". */
export interface CheckResult {
  readonly applicable: boolean;
  readonly findings: readonly Finding[];
}
