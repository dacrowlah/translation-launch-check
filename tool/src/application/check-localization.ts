import { checkLanguageColumn, checkLanguageLine } from "../domain/checks/language.js";
import type { LinePair, LocaleContext } from "../domain/checks/compare.js";
import type { Clock } from "../domain/ports/clock.js";
import type { LanguageDetector } from "../domain/ports/language-detector.js";
import type { Rules } from "../domain/rules.js";
import { resolvePair } from "../domain/tokens/resolve-pair.js";
import { tokenize } from "../domain/tokens/tokenize.js";
import {
  ALL_CHECK_IDS,
  type CheckId,
  type LocaleReport,
  type LocalizationPackage,
  type LocalizationReport,
  type PackageLine,
} from "../domain/types.js";
import { runLineChecks } from "./locale-checks.js";
import { buildReport, type Scored } from "./locale-report.js";

export interface CheckDeps {
  readonly rules: Rules;
  readonly clock: Clock;
  readonly detector: LanguageDetector;
}

const MASTER_IDS: readonly CheckId[] = ["language_column", "language_line"];

type Context = (locale: string) => LocaleContext | undefined;

/** A line with its master text, tokenized once in the master locale and shared by every target. */
type MasterLine = Pick<LinePair, "line" | "masterText" | "master">;

const textOf = (line: PackageLine, locale: string): string => line.texts[locale] ?? "";

const masterLineOf = (line: PackageLine, master: LocaleContext): MasterLine => {
  const masterText = textOf(line, master.locale);
  return { line, masterText, master: tokenize(masterText, master.rule, master.rules) };
};

/** The target tokenized in its own locale, then both sides resolved against each other. */
const pairOf = (source: MasterLine, ctx: LocaleContext): LinePair => {
  const targetText = textOf(source.line, ctx.locale);
  const [master, target] = resolvePair(source.master, tokenize(targetText, ctx.rule, ctx.rules));
  return { ...source, locale: ctx.locale, master, target, targetText };
};

/** The master's own line: only the language checks read it, so its tokens need no resolving. */
const ownPair = (source: MasterLine, ctx: LocaleContext): LinePair => ({
  ...source,
  locale: ctx.locale,
  target: source.master,
  targetText: source.masterText,
});

const columnOf = (scored: readonly Scored[], ctx: LocaleContext) =>
  checkLanguageColumn(
    scored.map((s) => s.pair.targetText),
    ctx,
  );

const reportFor = (sources: readonly MasterLine[], ctx: LocaleContext): LocaleReport => {
  const pairs = sources.map((source) => pairOf(source, ctx));
  const scored = pairs.map((pair) => ({ pair, results: runLineChecks(pair, ctx) }));
  return buildReport(ctx, scored, columnOf(scored, ctx), ALL_CHECK_IDS);
};

const languageOnly = (pair: LinePair, ctx: LocaleContext): Scored => ({
  pair,
  results: { language_line: checkLanguageLine(pair, ctx) },
});

const masterReport = (sources: readonly MasterLine[], ctx: LocaleContext): LocaleReport => {
  const scored = sources.map((source) => languageOnly(ownPair(source, ctx), ctx));
  return buildReport(ctx, scored, columnOf(scored, ctx), MASTER_IDS);
};

const NOT_CHECKED = {
  status: "unsupported_locale",
  column_findings: [],
  lines: [],
  checks: {},
} as const;

const unsupported = (locale: string): LocaleReport => ({ locale, ...NOT_CHECKED });

/** A context only for a locale the rules support (and while they hold the master's rule). */
const contextFor =
  (deps: CheckDeps, today: string): Context =>
  (locale) => {
    const { rules, detector } = deps;
    const [rule, masterRule] = [rules.locales[locale], rules.locales[rules.master_locale]];
    if (!rule || !masterRule) return undefined;
    return { locale, rule, masterRule, rules, detector, today };
  };

const versionOf = ({ version, effective_date }: Rules) => ({ version, effective_date });

/** The master tokenized once per line; none when the rules lack the master (nothing is checked). */
const sourcesOf = (pkg: LocalizationPackage, master?: LocaleContext): MasterLine[] =>
  master ? pkg.lines.map((line) => masterLineOf(line, master)) : [];

const localesOf = (pkg: LocalizationPackage, sources: readonly MasterLine[], context: Context) =>
  pkg.locales.map((locale) => {
    const ctx = context(locale);
    return ctx ? reportFor(sources, ctx) : unsupported(locale);
  });

export const checkLocalization = (
  pkg: LocalizationPackage,
  deps: CheckDeps,
): LocalizationReport => {
  const [context, code] = [contextFor(deps, deps.clock.today()), deps.rules.master_locale];
  const masterCtx = context(code);
  const sources = sourcesOf(pkg, masterCtx);
  const master = masterCtx ? masterReport(sources, masterCtx) : unsupported(code);
  return { rules: versionOf(deps.rules), master, locales: localesOf(pkg, sources, context) };
};
