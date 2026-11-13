import type { LocaleRule, Rules } from "../rules";
import { alternation } from "./regex";

const DAY = String.raw`(?<d>\d{1,2})(?!\d)`;
const YEAR = String.raw`(?<y>(?:19|20)\d\d)(?!\d)`;
const SLASHED = String.raw`(?<n1>\d{1,2})/(?<n2>\d{1,2})/${YEAR}(?![/\d])`;
const DOTTED = String.raw`(?<n1>\d{1,2})\.(?<n2>\d{1,2})\.(?:\s?${YEAR})?(?!\d)`;
const ARTICLES: Readonly<Record<string, readonly string[]>> = {
  en: ["the"],
  de: ["den", "dem"],
  fr: ["le"],
};
const FORMS: Readonly<Record<string, (month: string) => string[]>> = {
  en: (m) => [
    String.raw`${m}\.?\s+${DAY}(?:st|nd|rd|th)?(?:,?\s+${YEAR})?`,
    String.raw`${DAY}(?:st|nd|rd|th)?\s+(?:of\s+)?${m}\.?(?:,?\s+${YEAR})?`,
  ],
  de: (m) => [String.raw`${DAY}\.\s*${m}\.?(?:\s+${YEAR})?`],
  fr: (m) => [String.raw`${DAY}(?:er)?\s+${m}\.?(?:\s+${YEAR})?`],
  ja: () => [String.raw`(?:${YEAR}\u5e74)?(?<mi>\d{1,2})\u6708${DAY}\u65e5`],
};

/** Everything tokenizing needs for one language, compiled once from the rules. */
export interface Compiled {
  readonly date: RegExp;
  readonly bare: RegExp;
  readonly months: ReadonlyMap<string, number>;
  readonly weekdays: ReadonlyMap<string, number>;
}

const lookup = (groups: readonly (readonly string[])[], first: number): Map<string, number> =>
  new Map(
    groups.flatMap((names, i) => names.map((n) => [n.normalize("NFKC").toLowerCase(), i + first])),
  );

const monthPart = (names: readonly string[]): string => `(?<mn>${alternation(names)})(?!\\p{L})`;

const flat = (table: Readonly<Record<string, readonly (readonly string[])[]>>, l: LocaleRule) =>
  (table[l.language] ?? []).flat();

const japanese = (locale: LocaleRule): boolean => locale.script === "japanese";

const lead = (locale: LocaleRule): string =>
  japanese(locale) ? String.raw`(?<!\d)` : String.raw`(?<![\p{L}\d])`;

/** A full name may be followed by one article ("Sonntag, den 29."); a short form must touch the date. */
const prefix = (names: readonly string[], articles: readonly string[]): string => {
  const full = alternation(names.filter((n) => n.length > 3));
  const article = `(?:(?:${alternation(articles)})\\s+)?`;
  const short = alternation(names.filter((n) => n.length <= 3));
  return String.raw`(?:(?<wd>${full})(?!\p{L})\.?,?\s+${article}|(?<wd>${short})(?!\p{L})\.?,?\s+)?`;
};

const JA_DAY = String.raw`\u66dc\u65e5`;

const suffix = (names: readonly string[]): string => {
  const kanji = names.join("|");
  return String.raw`(?:\s?(?:[(\uff08](?<ws>${kanji})(?:${JA_DAY})?[)\uff09]|(?<ws>${kanji})${JA_DAY}))?`;
};

/** Numeric dates: dotted only in German; none may directly follow a currency. */
const numeric = (locale: LocaleRule, rules: Rules): string[] => {
  const currency = alternation(Object.keys(rules.currencies));
  const forms = locale.language === "de" ? [DOTTED, SLASHED] : [SLASHED];
  return forms.map((form) => String.raw`(?<!(?:${currency})[ \u00a0\u202f]?)${form}`);
};

const forms = (locale: LocaleRule, rules: Rules): string =>
  [
    ...(FORMS[locale.language]?.(monthPart(flat(rules.calendar.months, locale))) ?? []),
    ...numeric(locale, rules),
  ].join("|");

const dateSource = (locale: LocaleRule, rules: Rules): string => {
  const names = flat(rules.calendar.weekdays, locale);
  const articles = ARTICLES[locale.language] ?? [];
  const [before, after] = japanese(locale) ? ["", suffix(names)] : [prefix(names, articles), ""];
  return `${lead(locale)}${before}(?:${forms(locale, rules)})${after}`;
};

const bareSource = (locale: LocaleRule, rules: Rules): string => {
  const names = flat(rules.calendar.weekdays, locale);
  const kanji = names.join("|");
  if (japanese(locale)) {
    return String.raw`[(\uff08](?<w>${kanji})(?:${JA_DAY})?[)\uff09]|(?<w>${kanji})${JA_DAY}`;
  }
  return String.raw`(?<!\p{L})(?<w>${alternation(names.filter((n) => n.length > 3))})(?!\p{L})`;
};

const build = (locale: LocaleRule, rules: Rules): Compiled => ({
  date: new RegExp(dateSource(locale, rules), "giu"),
  bare: new RegExp(bareSource(locale, rules), "giu"),
  months: lookup(rules.calendar.months[locale.language] ?? [], 1),
  weekdays: lookup(rules.calendar.weekdays[locale.language] ?? [], 0),
});

const cache = new WeakMap<Rules, Map<string, Compiled>>();

/** The compiled patterns and name tables of the locale's language (one build per language). */
export const compile = (locale: LocaleRule, rules: Rules): Compiled => {
  const byLanguage = cache.get(rules) ?? new Map<string, Compiled>();
  cache.set(rules, byLanguage);
  const compiled = byLanguage.get(locale.language) ?? build(locale, rules);
  byLanguage.set(locale.language, compiled);
  return compiled;
};
