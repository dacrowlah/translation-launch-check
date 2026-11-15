import type { LocaleRule, Rules } from "../rules.js";
import { compile } from "./compiled.js";
import { normalizeGrouped, normalizeNumber, plainParts, readAmount } from "./number-patterns.js";
import { takeWith } from "./take.js";

/** "10 000": the whole number, or its parts, as the other side of the line decides. */
export interface Spaced {
  readonly joined: string;
  readonly parts: readonly string[];
}
type Found = string | Spaced;

/** The range a number starts runs upwards ("20 bis 50 %", never "50 bis 20 %"). */
const upwards = (m: RegExpExecArray, locale: LocaleRule): boolean => {
  const [from, to] = [m.groups?.n, m.groups?.rpEnd].map((n) => normalizeNumber(n ?? "", locale));
  return m.groups?.rp !== undefined && Number(from) <= Number(to);
};

/** A sign after the number, or after the end of the range it starts ("20 bis 50 %"). */
const percentOf = (m: RegExpExecArray, locale: LocaleRule): string =>
  m.groups?.pct !== undefined || upwards(m, locale) ? "%" : "";

/** The percent sign goes with the whole number and with its last part ("5 100%"). */
const withPercent = (parts: readonly string[], percent: string): string[] =>
  parts.map((part, i) => (i === parts.length - 1 ? `${part}${percent}` : part));

const spacedOf = (raw: string, m: RegExpExecArray, locale: LocaleRule): Spaced => {
  const percent = percentOf(m, locale);
  const parts = plainParts(raw).map((part) => normalizeNumber(part, locale));
  const joined = `${normalizeGrouped(raw, locale)}${percent}`;
  return { joined, parts: withPercent(parts, percent) };
};

const foundOf = (m: RegExpExecArray, locale: LocaleRule, rules: Rules): Found => {
  const spaced = m.groups?.sp;
  if (spaced !== undefined) return spacedOf(spaced, m, locale);
  const n = readAmount(m.groups?.n ?? "", m.groups?.x, locale, rules);
  return `${n}${percentOf(m, locale)}`;
};

/** Finds numbers ("30%" keeps its sign, without a space; never signed); each becomes a space. */
export const extractNumbers = (
  text: string,
  locale: LocaleRule,
  rules: Rules,
): { numbers: string[]; spaced: Spaced[]; rest: string } => {
  const read = (m: RegExpExecArray) => foundOf(m, locale, rules);
  const { items, rest } = takeWith(text, compile(locale, rules).numbers, read);
  const spaced = items.filter((item): item is Spaced => typeof item !== "string");
  return { numbers: items.filter((item) => typeof item === "string"), spaced, rest };
};
