import type { LocaleRule } from "../rules.js";

/** A per-language table's entry for the locale's language, or `none` when the rules have none. */
export const ofLanguage = <T>(table: Readonly<Record<string, T>>, locale: LocaleRule, none: T): T =>
  table[locale.language] ?? none;

/** A per-language list for the locale's language (empty when the rules have none). */
export const listOf = <T>(table: Readonly<Record<string, readonly T[]>>, locale: LocaleRule) =>
  ofLanguage<readonly T[]>(table, locale, []);

/** How a calendar name or time word is looked up: NFKC, lower case. */
export const nameKey = (name: string): string => name.normalize("NFKC").toLowerCase();
