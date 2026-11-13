import { checkLanguageColumn, checkLanguageLine } from "../domain/checks/language";
import type { LinePair, LocaleContext } from "../domain/checks/compare";
import type { Clock } from "../domain/ports/clock";
import type { LanguageDetector } from "../domain/ports/language-detector";
import type { Rules } from "../domain/rules";
import { tokenize } from "../domain/tokens/tokenize";
import {
  ALL_CHECK_IDS,
  type CheckId,
  type LocaleReport,
  type LocalizationPackage,
  type LocalizationReport,
  type PackageLine,
} from "../domain/types";
import { runLineChecks } from "./locale-checks";
import { buildReport, type Scored } from "./locale-report";

export interface CheckDeps {
  readonly rules: Rules;
  readonly clock: Clock;
  readonly detector: LanguageDetector;
}

const MASTER_IDS: readonly CheckId[] = ["language_column", "language_line"];
const MASTER = "en-US";

const pairOf = (line: PackageLine, locale: string, rules: Rules): LinePair => {
  const [masterText, targetText] = [line.texts[MASTER] ?? "", line.texts[locale] ?? ""];
  const [master, target] = [
    tokenize(masterText, MASTER, rules),
    tokenize(targetText, locale, rules),
  ];
  return { line, locale, master, target, masterText, targetText };
};

const columnOf = (scored: readonly Scored[], ctx: LocaleContext) =>
  checkLanguageColumn(
    scored.map((s) => s.pair.targetText),
    ctx,
  );

const reportFor = (pkg: LocalizationPackage, ctx: LocaleContext): LocaleReport => {
  const pairs = pkg.lines.map((line) => pairOf(line, ctx.locale, ctx.rules));
  const scored = pairs.map((pair) => ({ pair, results: runLineChecks(pair, ctx) }));
  return buildReport(ctx, scored, columnOf(scored, ctx), ALL_CHECK_IDS);
};

const masterReport = (pkg: LocalizationPackage, ctx: LocaleContext): LocaleReport => {
  const pairs = pkg.lines.map((line) => pairOf(line, MASTER, ctx.rules));
  const scored = pairs.map((pair) => ({
    pair,
    results: { language_line: checkLanguageLine(pair, ctx) },
  }));
  return buildReport(ctx, scored, columnOf(scored, ctx), MASTER_IDS);
};

const unsupported = (locale: string): LocaleReport => ({
  ...{ locale, status: "unsupported_locale", column_findings: [], lines: [], checks: {} },
});

const contextFor =
  (deps: CheckDeps, today: string) =>
  (locale: string): LocaleContext => ({
    locale,
    rules: deps.rules,
    detector: deps.detector,
    today,
  });

const localeReport = (pkg: LocalizationPackage, ctx: LocaleContext): LocaleReport =>
  ctx.rules.locales[ctx.locale] ? reportFor(pkg, ctx) : unsupported(ctx.locale);

const versionOf = ({ version, effective_date }: Rules) => ({ version, effective_date });

const localesOf = (pkg: LocalizationPackage, context: (locale: string) => LocaleContext) =>
  pkg.locales.map((locale) => localeReport(pkg, context(locale)));

export const checkLocalization = (
  pkg: LocalizationPackage,
  deps: CheckDeps,
): LocalizationReport => {
  const context = contextFor(deps, deps.clock.today());
  const master = masterReport(pkg, context(MASTER));
  return { rules: versionOf(deps.rules), master, locales: localesOf(pkg, context) };
};
