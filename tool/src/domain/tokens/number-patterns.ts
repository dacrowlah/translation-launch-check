import { multiplied, multiplierChain } from "./multipliers";
import type { LocaleRule, Rules } from "../rules";
import { listOf } from "./per-language";
import { anyOfSources, escape, escapeInClass, LATIN, NO_BREAK_SPACES, SPACE } from "./regex";

/** dash: ",-" or ",\u2013" ends a price; space: a plain space groups digits; fraction: decimals required. */
export interface NumberShape {
  readonly dash?: boolean;
  readonly space?: boolean;
  readonly fraction?: boolean;
}

/** A plain space groups digits only in some shapes (`space`), never by the locale's rule. */
const PLAIN_GROUP = " ";

/** A dash for the decimals of a price ("50,-", "50,\u2013", "Fr. 50.\u2013") means no cents. */
const DASH_DECIMALS = "\\p{Pd}";

/** The digits of one number in the locale: grouped by 3 or plain, with decimals. */
export const numberPattern = (locale: LocaleRule, shape: NumberShape = {}): string => {
  const chars = shape.space ? [...locale.group, PLAIN_GROUP] : locale.group;
  const group = `[${chars.map(escapeInClass).join("")}]`;
  const decimals = `(?:${escape(locale.decimal)}(?:\\d+${shape.dash ? `|${DASH_DECIMALS}` : ""}))`;
  return `(?:\\d{1,3}(?:${group}\\d{3})+(?!\\d)|\\d+)${decimals}${shape.fraction ? "" : "?"}`;
};

/** "1.299,00" in de becomes "1299"; a dash (",-") counts as ",00"; trailing zeros are dropped. */
export const normalizeNumber = (raw: string, locale: LocaleRule): string => {
  const plain = [...raw].filter((char) => !locale.group.includes(char)).join("");
  const dotted = plain.replace(locale.decimal, ".").replace(/\.\p{Pd}$/u, ".00");
  return dotted.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "");
};

/** A number whose digits a plain space may group ("1 299,00"), normalized. */
export const normalizeGrouped = (raw: string, locale: LocaleRule): string =>
  normalizeNumber(raw.replaceAll(PLAIN_GROUP, ""), locale);

/** The parts of a plain-space group ("10 000": "10", "000"), each as written. */
export const plainParts = (raw: string): string[] => raw.split(PLAIN_GROUP);

/** An amount as written with the multiplier chain after it, as one number ("1", "\u4e07"). */
export const readAmount = (
  raw: string,
  chain: string | undefined,
  locale: LocaleRule,
  rules: Rules,
): string => multiplied(normalizeGrouped(raw, locale), chain, locale, rules);

/** A percent sign or word after a number, also in a compound ("30 %", "20-Prozent-", "20-%-"). */
export const percentSource = (locale: LocaleRule, rules: Rules): string => {
  const words = anyOfSources(listOf(rules.percent_words, locale));
  return `(?:${SPACE}|-)?(?:%|(?:${words})(?!${LATIN}))`;
};

/** No-break spaces always group digits; a plain space only as resolvePair decides. */
const NO_BREAK = `[${NO_BREAK_SPACES}]`;

/**
 * Digits grouped by at least one plain space ("10 000", "1\u00a0000 000"): one number only
 * if the other side has it whole.
 */
export const spacedSource = (locale: LocaleRule): string => {
  const groups = `(?:${NO_BREAK}\\d{3})*(?: \\d{3})(?:${SPACE}\\d{3})*`;
  return `(?<!\\d)\\d{1,3}${groups}(?:${escape(locale.decimal)}\\d+)?(?!\\d)`;
};

/** What stands between the numbers of a range, spaces included ("20 bis 50", "20-50"). */
export const rangeLink = (locale: LocaleRule, rules: Rules): string =>
  anyOfSources(listOf(rules.percent_range_connectors, locale));

/**
 * "20 bis 50 %": a sign written once after a range also belongs to its first number.
 * `rpEnd` is the range's end; the reader carries the sign only when the start is not larger.
 */
const rangeStart = (locale: LocaleRule, rules: Rules, percent: string): string => {
  const end = `(?<rpEnd>${numberPattern(locale)})${percent}`;
  return `(?<rp>)(?=(?:${rangeLink(locale, rules)})${end})`;
};

/**
 * A number with an optional multiplier chain ("1\u4e07") and percent sign or word; a plain-space
 * group is a separate kind.
 */
export const numbersSource = (locale: LocaleRule, rules: Rules): string => {
  const percent = percentSource(locale, rules);
  /** An empty last branch, not "?": a "?" group never keeps an empty match (the range mark). */
  const sign = `(?:(?<pct>${percent})|${rangeStart(locale, rules, percent)}|)`;
  const spaced = `(?<sp>${spacedSource(locale)})(?<pct>${percent})?`;
  return `${spaced}|(?<n>${numberPattern(locale)})(?<x>${multiplierChain(locale, rules)})?${sign}`;
};
