import type { LocaleRule, Rules, TimeFormat, TwelveOClock } from "../rules";
import {
  anyClock,
  formatSourceOf,
  hourMinutes,
  isCandidate,
  minuteSeparator,
  timeConnectorList,
} from "./clock-formats";
import { noPrefixCurrency, noPriceRangeEnd } from "./price-guards";
import { listOf, nameKey, ofLanguage } from "./per-language";
import { alternation, anyOfSources, LATIN } from "./regex";

/** The clock-time pattern of one language, its time words ("midnight" -> "00:00") and 12. */
export interface ClockPatterns {
  readonly time: RegExp;
  readonly words: ReadonlyMap<string, string>;
  readonly twelve: TwelveOClock;
}

/** A candidate format marks its match with an empty group `cand`, so the reader knows. */
const marked = (format: TimeFormat): string =>
  isCandidate(format) ? `(?:${formatSourceOf(format)})(?<cand>)` : `(?:${formatSourceOf(format)})`;

/** The start of a range uses its own group names: h0, m0, half0, am0, pm0, cand0. */
const renamed = (source: string): string =>
  source.replace(/\(\?<(h|m|half|am|pm|cand)>/gu, (_all, name: string) => `(?<${name}0>`);

interface Language {
  readonly formats: readonly TimeFormat[];
  readonly connectors: string;
  /** What stands between an hour and its minutes, as a class ("[:.]"). */
  readonly separator: string;
  /**
   * Before a bare range start: the rules' start prefix (its groups renamed), and no amount of a
   * currency written before it starts there ("CHF 9.50"), nor the end of a price range written
   * after its currency ("CHF 12\u201315 bis 20 Uhr").
   */
  readonly beforeBare: string;
}

/** No price's amount, nor a price range's end, starts here. */
const noPrice = (locale: LocaleRule, rules: Rules): string =>
  `${noPrefixCurrency(locale, rules)}${noPriceRangeEnd(locale, rules)}`;

/** What is written around the time patterns: any clock time, and what joins split hours. */
interface Around {
  /** Any clock time of the language, without group names (anyClock). */
  readonly anyTime: string;
  /** What stands between the ranges of split hours: rules' separators, or a range connector. */
  readonly splitJoin: string;
}

const timeLanguageOf = (locale: LocaleRule, rules: Rules): Language => ({
  formats: listOf(rules.time_formats, locale),
  connectors: alternation(timeConnectorList(locale, rules)),
  separator: minuteSeparator(locale, rules),
  beforeBare: `${renamed(ofLanguage(rules.time_start_prefixes, locale, ""))}${noPrice(locale, rules)}`,
});

/**
 * A bare first hour ("9-17 Uhr", "\u5348\u5f8c1\uff5e5\u6642", "9.30-11pm"): `n0` as written.
 * Being no clock time on its own, it is never the amount of a currency before it ("CHF 9.50").
 */
const bareStart = (l: Language): string => {
  const hour = `(?<n0>${hourMinutes(l.separator, { groups: { h: "h0", m: "m0" } })})(?<bare0>)`;
  return `${l.beforeBare}${hour}`;
};

/**
 * The bare end of the first range of split hours, which takes the clock unit of the range
 * after it: "12" in "9\u201312, 14\u201318 Uhr" is a candidate, as "12 Uhr" would be. After a
 * weekday-like currency ("Fr. 9\u201312, ...") the bare start is guarded, so that stays francs.
 */
const splitEnd = (l: Language, around: Around): string => {
  const next = `${hourMinutes(l.separator)}\\s*(?:${l.connectors})\\s*(?:${around.anyTime})`;
  const end = `${hourMinutes(l.separator, { groups: { h: "h", m: "m" } })}(?<cand>)`;
  return `${end}(?=\\s*(?:${around.splitJoin})\\s*${next})`;
};

/** "9-17 Uhr", "de 9 h \u00e0 18 h": a start, a connector, then (at `endAt`) a written end. */
const rangeSource = (l: Language, around: Around): string => {
  const ends = `${anyOfSources(l.formats.map(marked))}|${splitEnd(l, around)}`;
  const start = `(?:${anyOfSources(l.formats.map(marked).map(renamed))}|${bareStart(l)})`;
  return `${start}\\s*(?:${l.connectors})\\s*(?<endAt>)(?:${ends})`;
};

/**
 * "at midnight", "12 noon", "10am-noon", "\u6b63\u5348"; never in a word ("apr\u00e8s-midi").
 * `clock`: any clock time of the language, without group names (anyClock).
 */
const wordSource = (clock: string, words: readonly string[]): string => {
  const lead = `(?:(?<!\\d)(?<wh>12)\\s?|(?<![${LATIN}-])|(?<=(?:${clock})-))`;
  return `${lead}(?<w>${alternation(words)})(?!-?${LATIN})`;
};

const wordsOf = (locale: LocaleRule, rules: Rules): [string, string][] =>
  Object.entries(ofLanguage(rules.time_words, locale, {}));

/**
 * A clock time starts after no digit, colon or dot and ends before no digit and no colon with
 * a digit after it ("8 PM: shop now" is a time). A written clock time is never a price, even
 * after a currency ("Fr. 20 Uhr"); only a bare range start is guarded (bareStart).
 */
const timeSource = (l: Language, words: readonly string[], around: Around): string => {
  const clock = `(?:${rangeSource(l, around)}|${anyOfSources(l.formats.map(marked))})`;
  const lead = "(?<![\\d:.])";
  return `${lead}${clock}(?!\\d|:\\d)|${wordSource(around.anyTime, words)}`;
};

const aroundOf = (locale: LocaleRule, rules: Rules): Around => {
  const joins = [
    ...listOf(rules.time_split_separators, locale),
    ...timeConnectorList(locale, rules),
  ];
  return { anyTime: anyClock(locale, rules), splitJoin: alternation(joins) };
};

const timePattern = (locale: LocaleRule, rules: Rules): RegExp => {
  const words = wordsOf(locale, rules).map(([word]) => word);
  return new RegExp(
    timeSource(timeLanguageOf(locale, rules), words, aroundOf(locale, rules)),
    "giud",
  );
};

/** 12 AM is midnight and 12 PM noon unless the language's rule says otherwise. */
const ENGLISH_TWELVE: TwelveOClock = { am: [0], pm: [12] };

export const clockPatterns = (locale: LocaleRule, rules: Rules): ClockPatterns => ({
  time: timePattern(locale, rules),
  words: new Map(wordsOf(locale, rules).map(([word, time]) => [nameKey(word), time])),
  twelve: ofLanguage(rules.twelve_oclock, locale, ENGLISH_TWELVE),
});

/** No clock time starts here ("Dec 3 - 8 PM": "8 PM" is no range end). */
export const noClockAhead = (locale: LocaleRule, rules: Rules): string =>
  `(?!${anyClock(locale, rules)})`;
