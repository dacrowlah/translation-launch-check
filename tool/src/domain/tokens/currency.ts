import type { LocaleRule, Rules } from "../rules";
import { alternation, escape } from "./regex";

/** The shared currency table with the locale's own entries ("Fr." only in de-CH). */
export const currenciesOf = (
  locale: LocaleRule,
  rules: Rules,
): Readonly<Record<string, string>> => ({
  ...rules.currencies,
  ...locale.currencies,
});

/** A currency word written in lower case in the rules ("yen") is matched in any case. */
const isWord = (name: string): boolean => /^\p{Ll}+$/u.test(name);

/** Currency words are data and case-insensitive by rule, so "(?i:...)" fits here. */
const currencySourceOf = (name: string): string =>
  isWord(name) ? `(?i:${escape(name)})` : escape(name);

/** Currency names as one alternation, longest first. */
export const namesSource = (names: readonly string[]): string =>
  alternation(names, currencySourceOf);

/** Every currency symbol, code or word of the locale, as one alternation. */
export const currencyNames = (locale: LocaleRule, rules: Rules): string =>
  namesSource(Object.keys(currenciesOf(locale, rules)));

const sameName = (name: string, written: string): boolean => {
  const own = name.normalize("NFKC");
  return own === written || (isWord(own) && own === written.toLowerCase());
};

/** The ISO code of a currency as written ("Yen" is JPY); an unknown one stays as written. */
export const currencyCodeOf = (written: string, locale: LocaleRule, rules: Rules): string =>
  Object.entries(currenciesOf(locale, rules)).find(([name]) => sameName(name, written))?.[1] ??
  written;
