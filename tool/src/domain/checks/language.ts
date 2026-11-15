import { makeFinding } from "../finding";
import type { CheckId, CheckResult } from "../types";
import type { LineCheck, LocaleContext } from "./compare";
import { candidateLanguages, japaneseShare, letterCount, stripForLanguage } from "./language-text";

const NAMES: Record<string, string> = { en: "English", de: "German", fr: "French", ja: "Japanese" };
const NOT_APPLICABLE: CheckResult = { applicable: false, findings: [] };
const OK: CheckResult = { applicable: true, findings: [] };

const finding = (ctx: LocaleContext, check: CheckId, detail: string): CheckResult => ({
  applicable: true,
  findings: [makeFinding(ctx.rules, check, { detail })],
});

const nameOf = (code: string): string => NAMES[code] ?? code;
const isJapanese = (ctx: LocaleContext): boolean => ctx.rule.script === "japanese";

/** "ja" for Japanese text, else the detector's answer: a candidate, or null when unsure. */
const reading = (text: string, ctx: LocaleContext): string | null =>
  japaneseShare(text) >= 0.5 ? "ja" : ctx.detector.detect(text, candidateLanguages(ctx.rules));

const expected = (ctx: LocaleContext): string => ctx.rule.language;

const lineVerdict = (text: string, ctx: LocaleContext): CheckResult => {
  const read = reading(text, ctx);
  const detail = `This line reads as ${nameOf(read ?? "")}.`;
  if (read === null) return NOT_APPLICABLE;
  return read === expected(ctx) ? OK : finding(ctx, "language_line", detail);
};

const japaneseLine = (text: string, ctx: LocaleContext): CheckResult => {
  if (japaneseShare(text) > 0) return OK;
  const detail = "This line has no Japanese characters.";
  return letterCount(text) >= ctx.rules.language_check.min_letters
    ? finding(ctx, "language_line", detail)
    : NOT_APPLICABLE;
};

const latinLine = (text: string, ctx: LocaleContext): CheckResult =>
  japaneseShare(text) >= 0.5 || letterCount(text) >= ctx.rules.language_check.min_letters
    ? lineVerdict(text, ctx)
    : NOT_APPLICABLE;

export const checkLanguageLine: LineCheck = (pair, ctx) => {
  const text = stripForLanguage(pair.targetText, ctx.rules);
  if (letterCount(text) === 0) return NOT_APPLICABLE;
  return isJapanese(ctx) ? japaneseLine(text, ctx) : latinLine(text, ctx);
};

const unsure = (ctx: LocaleContext): CheckResult => {
  const detail = `Couldn't confirm the ${ctx.locale} column's language.`;
  const [made] = finding(ctx, "language_column", detail).findings;
  return { applicable: true, findings: made ? [{ ...made, severity: "warning" }] : [] };
};

const latinColumn = (text: string, ctx: LocaleContext): CheckResult => {
  const read = reading(text, ctx);
  const detail = `The ${ctx.locale} column reads as ${nameOf(read ?? "")}.`;
  if (read === null) return unsure(ctx);
  return read === expected(ctx) ? OK : finding(ctx, "language_column", detail);
};

const japaneseColumn = (text: string, ctx: LocaleContext): CheckResult =>
  japaneseShare(text) > 0
    ? OK
    : finding(ctx, "language_column", `The ${ctx.locale} column has no Japanese characters.`);

const joinedColumn = (texts: readonly string[], ctx: LocaleContext): string =>
  texts
    .map((t) => stripForLanguage(t, ctx.rules))
    .filter((t) => t !== "")
    .join(". ");

export const checkLanguageColumn = (texts: readonly string[], ctx: LocaleContext): CheckResult => {
  const text = joinedColumn(texts, ctx);
  if (letterCount(text) === 0) return NOT_APPLICABLE;
  return isJapanese(ctx) ? japaneseColumn(text, ctx) : latinColumn(text, ctx);
};
