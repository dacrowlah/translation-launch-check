import type { LocaleRule, Rules } from "../rules.js";
import { calendarPatterns, type CalendarPatterns } from "./date-patterns.js";
import { moneySource } from "./money-patterns.js";
import { numbersSource } from "./number-patterns.js";
import { perRules, stored } from "./per-rules.js";
import { clockPatterns, type ClockPatterns } from "./time-patterns.js";

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
