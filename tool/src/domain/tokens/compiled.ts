import type { LocaleRule, Rules } from "../rules";
import { calendarPatterns, type CalendarPatterns } from "./date-patterns";
import { moneySource } from "./money-patterns";
import { numbersSource } from "./number-patterns";
import { perRules, stored } from "./per-rules";
import { clockPatterns, type ClockPatterns } from "./time-patterns";

/** Everything tokenizing needs for one locale, compiled once per rules and locale. */
export interface Compiled {
  readonly calendar: CalendarPatterns;
  readonly money: RegExp;
  readonly numbers: RegExp;
  readonly clock: ClockPatterns;
}

const build = (locale: LocaleRule, rules: Rules): Compiled => ({
  calendar: calendarPatterns(locale, rules),
  money: new RegExp(moneySource(locale, rules), "gu"),
  numbers: new RegExp(numbersSource(locale, rules), "giu"),
  clock: clockPatterns(locale, rules),
});

/** Each locale object is its own key, so de-DE and de-CH never share patterns. */
const byRules = perRules(() => new WeakMap<LocaleRule, Compiled>());

export const compile = (locale: LocaleRule, rules: Rules): Compiled =>
  byRules(rules).get(locale) ?? stored(byRules(rules), locale, build(locale, rules));
