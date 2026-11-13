import type { LocaleRule, Rules } from "../rules";
import { alternation } from "./regex";

const DAY = String.raw`(?<d>\d{1,2})(?!\d)`;
const YEAR = String.raw`(?<y>(?:19|20)\d\d)(?!\d)`;
const NUMERIC = [
  String.raw`(?<n1>\d{1,2})/(?<n2>\d{1,2})(?:/${YEAR})?(?![/\d])`,
  String.raw`(?<n1>\d{1,2})\.(?<n2>\d{1,2})\.(?!\d)(?:\s?${YEAR})?`,
];
const FORMS: Readonly<Record<string, (month: string) => string[]>> = {
  en: (m) => [
    String.raw`${m}\.?\s+${DAY}(?:st|nd|rd|th)?(?:,?\s+${YEAR})?`,
    String.raw`${DAY}(?:st|nd|rd|th)?\s+(?:of\s+)?${m}\.?(?:,?\s+${YEAR})?`,
  ],
  de: (m) => [String.raw`${DAY}\.\s*${m}\.?(?:\s+${YEAR})?`],
  fr: (m) => [String.raw`${DAY}(?:er)?\s+${m}\.?(?:\s+${YEAR})?`],
  ja: () => [String.raw`(?:${YEAR}年)?(?<mi>\d{1,2})月${DAY}日`],
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

const prefix = (names: readonly string[]): string =>
  String.raw`(?:(?<wd>${alternation(names)})(?!\p{L})\.?,?\s+)?`;

const suffix = (names: readonly string[]): string =>
  `(?:[(\uff08](?<ws>${names.join("|")})[)\uff09])?`;

const forms = (locale: LocaleRule, rules: Rules): string =>
  [
    ...(FORMS[locale.language]?.(monthPart(flat(rules.calendar.months, locale))) ?? []),
    ...NUMERIC,
  ].join("|");

const dateSource = (locale: LocaleRule, rules: Rules): string => {
  const names = flat(rules.calendar.weekdays, locale);
  const [before, after] = japanese(locale) ? ["", suffix(names)] : [prefix(names), ""];
  return `${lead(locale)}${before}(?:${forms(locale, rules)})${after}`;
};

const bareSource = (locale: LocaleRule, rules: Rules): string => {
  const names = flat(rules.calendar.weekdays, locale);
  if (japanese(locale)) return `[(\uff08](${names.join("|")})[)\uff09]`;
  return String.raw`(?<!\p{L})(${alternation(names.filter((n) => n.length > 3))})(?!\p{L})`;
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
