import { checkLanguageColumn, checkLanguageLine } from "../domain/checks/language";
import type { LinePair, LocaleContext } from "../domain/checks/compare";
import { resolvedSides } from "../domain/checks/sides";
import type { Clock } from "../domain/ports/clock";
import type { LanguageDetector } from "../domain/ports/language-detector";
import type { Rules } from "../domain/rules";
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

type Context = (locale: string) => LocaleContext | undefined;

const textOf = (line: PackageLine, locale: string): string => line.texts[locale] ?? "";

const pairOf = (line: PackageLine, ctx: LocaleContext): LinePair => {
  const [masterText, targetText] = [
    textOf(line, ctx.rules.master_locale),
    textOf(line, ctx.locale),
  ];
  const [master, target] = resolvedSides(masterText, targetText, ctx);
  return { line, locale: ctx.locale, master, target, masterText, targetText };
};

const columnOf = (scored: readonly Scored[], ctx: LocaleContext) =>
  checkLanguageColumn(
    scored.map((s) => s.pair.targetText),
    ctx,
  );

const reportFor = (pkg: LocalizationPackage, ctx: LocaleContext): LocaleReport => {
  const pairs = pkg.lines.map((line) => pairOf(line, ctx));
  const scored = pairs.map((pair) => ({ pair, results: runLineChecks(pair, ctx) }));
  return buildReport(ctx, scored, columnOf(scored, ctx), ALL_CHECK_IDS);
};

const masterReport = (pkg: LocalizationPackage, ctx: LocaleContext): LocaleReport => {
  const pairs = pkg.lines.map((line) => pairOf(line, ctx));
  const scored = pairs.map((pair) => ({
    pair,
    results: { language_line: checkLanguageLine(pair, ctx) },
  }));
  return buildReport(ctx, scored, columnOf(scored, ctx), MASTER_IDS);
};

const unsupported = (locale: string): LocaleReport => ({
  ...{ locale, status: "unsupported_locale", column_findings: [], lines: [], checks: {} },
});

/** A context only for a locale the rules support (and while they hold the master's rule). */
const contextFor =
  (deps: CheckDeps, today: string): Context =>
  (locale) => {
    const { rules, detector } = deps;
    const [rule, masterRule] = [rules.locales[locale], rules.locales[rules.master_locale]];
    if (!rule || !masterRule) return undefined;
    return { locale, rule, masterRule, rules, detector, today };
  };

const localeReport = (pkg: LocalizationPackage, locale: string, ctx?: LocaleContext) =>
  ctx ? reportFor(pkg, ctx) : unsupported(locale);

const masterOf = (pkg: LocalizationPackage, master: string, ctx?: LocaleContext): LocaleReport =>
  ctx ? masterReport(pkg, ctx) : unsupported(master);

const versionOf = ({ version, effective_date }: Rules) => ({ version, effective_date });

const localesOf = (pkg: LocalizationPackage, context: Context) =>
  pkg.locales.map((locale) => localeReport(pkg, locale, context(locale)));

export const checkLocalization = (
  pkg: LocalizationPackage,
  deps: CheckDeps,
): LocalizationReport => {
  const context = contextFor(deps, deps.clock.today());
  const code = deps.rules.master_locale;
  const master = masterOf(pkg, code, context(code));
  return { rules: versionOf(deps.rules), master, locales: localesOf(pkg, context) };
};
