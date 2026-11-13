import type { LocaleRule, Rules } from "../rules";
import { extractDates, extractWeekdays, type DateToken } from "./dates";
import { extractMergeTags } from "./merge-tags";
import { extractMoney, type Money } from "./money";
import { extractNumbers } from "./numbers";
import { extractPromoCodes } from "./promo-codes";
import { extractUrls, type Url } from "./urls";

export interface Tokens {
  readonly urls: Url[];
  readonly mergeTags: string[];
  readonly promoCodes: string[];
  readonly dates: DateToken[];
  readonly weekdays: number[];
  readonly money: Money[];
  readonly numbers: string[];
  readonly rest: string;
}

type Stage = (acc: Tokens) => Tokens;

const urls: Stage = (acc) => ({ ...acc, ...extractUrls(acc.rest) });

const mergeTags =
  (rules: Rules): Stage =>
  (acc) => {
    const { tags, rest } = extractMergeTags(acc.rest, rules);
    return { ...acc, mergeTags: tags, rest };
  };

const promoCodes =
  (rules: Rules): Stage =>
  (acc) => {
    const { codes, rest } = extractPromoCodes(acc.rest, rules);
    return { ...acc, promoCodes: codes, rest };
  };

const dates =
  (locale: LocaleRule, rules: Rules): Stage =>
  (acc) => ({ ...acc, ...extractDates(acc.rest, locale, rules) });

const money =
  (locale: LocaleRule, rules: Rules): Stage =>
  (acc) => ({ ...acc, ...extractMoney(acc.rest, locale, rules) });

const numbers =
  (locale: LocaleRule): Stage =>
  (acc) => ({ ...acc, ...extractNumbers(acc.rest, locale) });

const weekdays =
  (locale: LocaleRule, rules: Rules): Stage =>
  (acc) => ({ ...acc, ...extractWeekdays(acc.rest, locale, rules) });

const NONE: Omit<Tokens, "rest"> = {
  urls: [],
  mergeTags: [],
  promoCodes: [],
  dates: [],
  weekdays: [],
  money: [],
  numbers: [],
};

const start = (rest: string): Tokens => ({ ...NONE, rest });

const localeRule = (rules: Rules, locale: string): LocaleRule => {
  const rule = rules.locales[locale];
  if (!rule) throw new RangeError(`unknown locale ${locale}`);
  return rule;
};

/** Splits a line into comparable tokens (on an NFKC copy); what is left is `rest`. */
export const tokenize = (text: string, locale: string, rules: Rules): Tokens => {
  const rule = localeRule(rules, locale);
  const stages = [urls, mergeTags(rules), promoCodes(rules), dates(rule, rules)];
  stages.push(money(rule, rules), numbers(rule), weekdays(rule, rules));
  return stages.reduce((acc, stage) => stage(acc), start(text.normalize("NFKC")));
};
