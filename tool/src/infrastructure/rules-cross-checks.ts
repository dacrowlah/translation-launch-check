import type { Rules, TimeFormat } from "../domain/rules.js";
import { formatSourceOf } from "../domain/tokens/clock-formats.js";

const glossaryLocales = ({ glossary: g }: Rules): string[] => [
  ...Object.keys(g.forbidden),
  ...Object.keys(g.approved_translations),
];

const references = (r: Rules): [string, string[]][] => [
  ["master_locale", [r.master_locale]],
  ["locale_aliases", Object.values(r.locale_aliases)],
  ["glossary", glossaryLocales(r)],
  ["spelling", Object.keys(r.spelling)],
];

const languageIssues = (r: Rules): string[] => {
  const used = new Set(Object.values(r.locales).map((l) => l.language));
  return Object.keys(r.accepted_loanwords)
    .filter((k) => !used.has(k))
    .map((k) => `accepted_loanwords: unknown language ${k}`);
};

/** Each key of `table` that `other` lacks, as "<issue> <key>". */
const missingFrom = (table: object, other: object, issue: string): string[] =>
  Object.keys(table)
    .filter((language) => !Object.hasOwn(other, language))
    .map((language) => `${issue} ${language}`);

const MINUTES = "time_minute_separators";

/** The sign a format writes between its hour and minutes ("[:.]", ":", "\\."); none for "9 h 30". */
const BETWEEN = /\(\?<h>[^)]*\)(?:\(\?:)?(\[[^\]]*\]|\\?[^\w\s\\(])\(\?<m>/u;

const separatorsOf = (format: TimeFormat): string[] => [
  ...(formatSourceOf(format).match(BETWEEN)?.[1] ?? "").replace(/[[\]\\]/gu, ""),
];

/** A format's minute separators drift from the declared ones: the code would read them apart. */
const driftIssues = (r: Rules): string[] =>
  Object.entries(r.time_formats).flatMap(([language, formats]) => {
    const declared = r.time_minute_separators[language] ?? [];
    const undeclared = new Set(formats.flatMap(separatorsOf).filter((c) => !declared.includes(c)));
    return [...undeclared].map(
      (c) => `time_formats: ${language} writes "${c}" before minutes, not in ${MINUTES}`,
    );
  });

/**
 * Every language with time formats says how it writes minutes, only those languages do, and
 * their formats use only the declared separators.
 */
const minuteIssues = (r: Rules): string[] => [
  ...missingFrom(r.time_formats, r.time_minute_separators, `${MINUTES}: none for`),
  ...missingFrom(r.time_minute_separators, r.time_formats, `${MINUTES}: no time_formats for`),
  ...driftIssues(r),
];

/** The promo pattern must read its excluded suffixes, or the list is silently unused. */
const promoIssues = (r: Rules): string[] =>
  r.promo_code_pattern.includes("{excluded_suffixes}")
    ? []
    : ["promo_code_pattern: no {excluded_suffixes} place"];

const localeIssues = (r: Rules): string[] =>
  references(r).flatMap(([label, keys]) =>
    keys.filter((k) => !(k in r.locales)).map((k) => `${label}: unknown locale ${k}`),
  );

/** Rules that point at locales or languages the file does not define, or that go unread. */
export const crossIssues = (r: Rules): string[] => [
  ...localeIssues(r),
  ...languageIssues(r),
  ...minuteIssues(r),
  ...promoIssues(r),
];
