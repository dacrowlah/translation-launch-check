import { makeFinding, makeUnsureFinding } from "../finding.js";
import type { CheckId, CheckResult, Finding } from "../types.js";
import type { LineCheck, LocaleContext } from "./compare.js";
import {
  candidateLanguages,
  japaneseShare,
  letterCount,
  stripForLanguage,
} from "./language-text.js";

const NAMES: Record<string, string> = { en: "English", de: "German", fr: "French", ja: "Japanese" };
const NOT_APPLICABLE: CheckResult = { applicable: false, findings: [] };
const OK: CheckResult = { applicable: true, findings: [] };

const found = (finding: Finding): CheckResult => ({ applicable: true, findings: [finding] });
const certain = (ctx: LocaleContext, check: CheckId, detail: string): CheckResult =>
  found(makeFinding(ctx.rules, check, { detail }));
const unsure = (ctx: LocaleContext, detail: string): CheckResult =>
  found(makeUnsureFinding(ctx.rules, "language_column", { detail }));

const nameOf = (code: string): string => NAMES[code] ?? code;
const isJapanese = (ctx: LocaleContext): boolean => ctx.rule.script === "japanese";
const expected = (ctx: LocaleContext): string => ctx.rule.language;

const isShort = (text: string, ctx: LocaleContext): boolean =>
  letterCount(text) < ctx.rules.language_check.min_letters;
const mostlyJapanese = (text: string, ctx: LocaleContext): boolean =>
  japaneseShare(text) >= ctx.rules.language_check.japanese_share;

/** The detector's answer for latin text: a candidate, or null when unsure. */
const detected = (text: string, ctx: LocaleContext): string | null =>
  ctx.detector.detect(text, candidateLanguages(ctx.rules));

const JAPANESE_LINE = "This line reads as Japanese.";
const SOME_JAPANESE = "This line has Japanese characters.";

/** The script rule is certain: Japanese characters do not belong in a latin-script line. */
const japaneseInLatin = (text: string, ctx: LocaleContext): CheckResult =>
  certain(ctx, "language_line", mostlyJapanese(text, ctx) ? JAPANESE_LINE : SOME_JAPANESE);

/** A long latin line the detector reads as another language; short or unsure lines are skipped. */
const detectedLine = (text: string, ctx: LocaleContext): CheckResult => {
  const read = isShort(text, ctx) ? null : detected(text, ctx);
  if (read === null) return NOT_APPLICABLE;
  if (read === expected(ctx)) return OK;
  return certain(ctx, "language_line", `This line reads as ${nameOf(read)}.`);
};

const latinLine = (text: string, ctx: LocaleContext): CheckResult =>
  japaneseShare(text) > 0 ? japaneseInLatin(text, ctx) : detectedLine(text, ctx);

const japaneseLine = (text: string, ctx: LocaleContext): CheckResult =>
  japaneseShare(text) > 0
    ? OK
    : certain(ctx, "language_line", "This line has no Japanese characters.");

const strip = (text: string, ctx: LocaleContext): string =>
  stripForLanguage(text, ctx.rules, ctx.rule);

export const checkLanguageLine: LineCheck = (pair, ctx) => {
  const text = strip(pair.targetText, ctx);
  if (letterCount(text) === 0) return NOT_APPLICABLE;
  return isJapanese(ctx) ? japaneseLine(text, ctx) : latinLine(text, ctx);
};

/** The detector could not tell, or the column is too short to trust its answer: a question. */
const unsureColumn = (read: string | null, ctx: LocaleContext): CheckResult => {
  const question = `Is it ${nameOf(expected(ctx))}?`;
  return read === null
    ? unsure(ctx, `Couldn't confirm the ${ctx.locale} column's language. ${question}`)
    : unsure(ctx, `The ${ctx.locale} column is short and reads as ${nameOf(read)}. ${question}`);
};

const detectedColumn = (text: string, ctx: LocaleContext): CheckResult => {
  const read = detected(text, ctx);
  if (read === expected(ctx)) return OK;
  if (read === null || isShort(text, ctx)) return unsureColumn(read, ctx);
  return certain(ctx, "language_column", `The ${ctx.locale} column reads as ${nameOf(read)}.`);
};

const latinColumn = (text: string, ctx: LocaleContext): CheckResult =>
  mostlyJapanese(text, ctx)
    ? certain(ctx, "language_column", `The ${ctx.locale} column reads as Japanese.`)
    : detectedColumn(text, ctx);

/** Not one line holds Japanese script: the column is certainly not Japanese. */
const noJapaneseLine = (lines: readonly string[]): boolean =>
  lines.every((line) => japaneseShare(line) === 0);

/**
 * Mostly Latin letters: a blocker only when no line has any Japanese; Latin retail words and
 * Latin-only CTAs beside Japanese lines ("SALE", "50%OFF", "SHOP NOW") make it a question.
 */
const notJapaneseColumn = (lines: readonly string[], ctx: LocaleContext): CheckResult =>
  noJapaneseLine(lines)
    ? certain(ctx, "language_column", `The ${ctx.locale} column is mostly not Japanese.`)
    : unsure(ctx, `The ${ctx.locale} column is mostly in Latin letters. Is it Japanese?`);

const japaneseColumn = (lines: readonly string[], text: string, ctx: LocaleContext) =>
  mostlyJapanese(text, ctx) ? OK : notJapaneseColumn(lines, ctx);

/** Each line's words, empty lines left out. */
const columnLines = (texts: readonly string[], ctx: LocaleContext): string[] =>
  texts.map((t) => strip(t, ctx)).filter((t) => t !== "");

export const checkLanguageColumn = (texts: readonly string[], ctx: LocaleContext): CheckResult => {
  const lines = columnLines(texts, ctx);
  const text = lines.join(". ");
  if (letterCount(text) === 0) return NOT_APPLICABLE;
  return isJapanese(ctx) ? japaneseColumn(lines, text, ctx) : latinColumn(text, ctx);
};
