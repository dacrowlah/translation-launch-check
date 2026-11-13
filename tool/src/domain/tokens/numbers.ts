import type { LocaleRule } from "../rules";
import { escape, escapeInClass } from "./regex";

const SPACES = "[ \\u00a0\\u202f]";

/** The digits of one number in the locale: grouped by 3 or plain, optional decimals. */
export const numberPattern = (locale: LocaleRule, dash = false): string => {
  const group = `[${locale.group.map(escapeInClass).join("")}]`;
  const decimals = `(?:${escape(locale.decimal)}(?:\\d+${dash ? "|-" : ""}))?`;
  return `(?:\\d{1,3}(?:${group}\\d{3})+(?!\\d)|\\d+)${decimals}`;
};

/** "1.299,00" in de becomes "1299"; ",-" counts as ",00"; trailing fractional zeros are dropped. */
export const normalizeNumber = (raw: string, locale: LocaleRule): string => {
  const plain = [...raw].filter((char) => !locale.group.includes(char)).join("");
  const dotted = plain.replace(locale.decimal, ".").replace(/\.-$/u, ".00");
  return dotted.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "");
};

/** Finds numbers (percent signs dropped, never signed); each becomes one space in rest. */
export const extractNumbers = (
  text: string,
  locale: LocaleRule,
): { numbers: string[]; rest: string } => {
  const pattern = new RegExp(`(${numberPattern(locale)})(?:${SPACES}?%)?`, "gu");
  const numbers = [...text.matchAll(pattern)].map((m) => normalizeNumber(m[1] ?? "", locale));
  return { numbers, rest: text.replace(pattern, " ") };
};
