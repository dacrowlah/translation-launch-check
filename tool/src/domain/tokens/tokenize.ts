import type { LocaleRule, Rules } from "../rules";
import { extractDates, extractWeekdays, type DateToken, type Slash } from "./dates";
import { extractMergeTags } from "./merge-tags";
import { extractMoney, type Money, type SpacedMoney } from "./money";
import { extractNumbers, type Spaced } from "./numbers";
import { extractPromoCodes, promoPattern } from "./promo-codes";
import { decodeReferences } from "./references";
import { NO_BREAK_SPACES } from "./regex";
import { dntPattern } from "./terms";
import { extractTimes, type Candidate, type Twelve } from "./times";
import { extractUrls, type Url } from "./urls";

export interface Tokens {
  readonly urls: Url[];
  readonly mergeTags: string[];
  readonly promoCodes: string[];
  readonly dates: DateToken[];
  /** Yearless n/n forms; resolvePair turns them into dates or numbers before any check. */
  readonly slashes: Slash[];
  readonly weekdays: number[];
  /** Clock times as "HH:MM"; compared together with the numbers. */
  readonly times: string[];
  /** Times that count only opposite a time ("21 h", "midnight"); resolvePair decides. */
  readonly candidates: Candidate[];
  /** 12 o'clock times with two meanings (\u5348\u5f8c12\u6642); resolvePair picks one. */
  readonly twelves: Twelve[];
  readonly money: Money[];
  /** Prices with a plain-space group ("\u20ac 2 000"); resolvePair makes each whole or parts. */
  readonly spacedMoney: SpacedMoney[];
  readonly numbers: string[];
  /** Plain-space groups ("10 000"); resolvePair makes each one number or its parts. */
  readonly spaced: Spaced[];
  /**
   * What is left. URLs, merge tags and promo codes are taken from the text as sent; then
   * character references are decoded, the rest is NFKC-normalized and do-not-translate terms
   * are removed, for dates, clock times, money, numbers and weekdays. Never use it for
   * typography or trademark checks.
   */
  readonly rest: string;
}

type Stage = (acc: Tokens, rule: LocaleRule, rules: Rules) => Tokens;
type Extract = (text: string, rule: LocaleRule, rules: Rules) => Partial<Tokens>;
type ExtractWithRules = (text: string, rules: Rules) => Partial<Tokens>;

/** A stage that reads its tokens from what is left and keeps the rest of the extractor. */
const spread =
  (extract: Extract): Stage =>
  (acc, rule, rules) => ({ ...acc, ...extract(acc.rest, rule, rules) });

/** The same, for an extractor that needs no locale (merge tags, promo codes). */
const withRules =
  (extract: ExtractWithRules): Extract =>
  (text, _rule, rules) =>
    extract(text, rules);

const NOT_A_SPACE = new RegExp(`[^${NO_BREAK_SPACES}]+`, "gu");

/** NFKC, except for no-break and narrow no-break spaces: they group digits ("10\u00a0000"). */
const nfkcKeepingSpaces = (text: string): string =>
  text.replace(NOT_A_SPACE, (part) => part.normalize("NFKC"));

/**
 * The text as the value stages read it: "&nbsp;" and "&#8239;" are the spaces they encode (so
 * "20&nbsp;%" reads as "20 %"), then NFKC, keeping the no-break spaces.
 */
export const readable = (text: string): string => nfkcKeepingSpaces(decodeReferences(text));

const toReadable: Stage = (acc) => ({ ...acc, rest: readable(acc.rest) });

/** A code that only NFKC made ("\uff22\uff26\uff12\uff16") was missing as sent; it is no number. */
const promoResidue: Stage = (acc, _rule, rules) => ({
  ...acc,
  rest: acc.rest.replace(promoPattern(rules), " "),
});

/** Do-not-translate terms ("Black Friday", "Cyber Monday") hold weekday names that are no dates. */
const withoutTerms: Stage = (acc, _rule, rules) => ({
  ...acc,
  rest: acc.rest.replace(dntPattern(rules), " "),
});

/**
 * In order: structural tokens on the raw text, then readable text without do-not-translate
 * terms (a term inside a link stays part of the link), then the copy's values.
 */
const STAGES: readonly Stage[] = [
  spread(extractUrls),
  spread(withRules(extractMergeTags)),
  spread(withRules(extractPromoCodes)),
  toReadable,
  promoResidue,
  withoutTerms,
  spread(extractDates),
  spread(extractTimes),
  spread(extractMoney),
  spread(extractNumbers),
  spread(extractWeekdays),
];

const NONE: Omit<Tokens, "rest"> = {
  urls: [],
  mergeTags: [],
  promoCodes: [],
  dates: [],
  slashes: [],
  weekdays: [],
  times: [],
  candidates: [],
  twelves: [],
  money: [],
  spacedMoney: [],
  numbers: [],
  spaced: [],
};

const start = (rest: string): Tokens => ({ ...NONE, rest });

/** Splits a line into comparable tokens for a supported locale; what is left is `rest`. */
export const tokenize = (text: string, rule: LocaleRule, rules: Rules): Tokens =>
  STAGES.reduce((acc, stage) => stage(acc, rule, rules), start(text));
