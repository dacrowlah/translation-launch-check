import type { LocaleRule, Rules, TimeFormat } from "../rules";
import { listOf } from "./per-language";
import { anyChar, anyOfSources } from "./regex";

/** A time format's pattern, whether it is a definite time or a candidate. */
export const formatSourceOf = (format: TimeFormat): string =>
  typeof format === "string" ? format : format.pattern;

/** A candidate format is a time only opposite a time ("21 h"); a string never is one. */
export const isCandidate = (format: TimeFormat): boolean =>
  typeof format !== "string" && format.candidate;

/** Any clock time of the language, with its group names dropped, so it nests in any pattern. */
export const anyClock = (locale: LocaleRule, rules: Rules): string =>
  anyOfSources(listOf(rules.time_formats, locale).map(formatSourceOf)).replace(
    /\(\?<[A-Za-z]\w*>/gu,
    "(?:",
  );

/** The words or signs between the two times of a range ("-", "bis"), as written in the rules. */
export const timeConnectorList = (locale: LocaleRule, rules: Rules): readonly string[] =>
  listOf(rules.time_range_connectors, locale);

/** What the language writes between an hour and its minutes ("9:30", "9.30"), as a class. */
export const minuteSeparator = (locale: LocaleRule, rules: Rules): string =>
  anyChar(listOf(rules.time_minute_separators, locale));

/** Group names for the hour and the minutes; `required`: the minutes must be written. */
export interface HourShape {
  readonly groups?: { readonly h: string; readonly m: string };
  readonly required?: boolean;
}

const named = (group: string | undefined, source: string): string =>
  group === undefined ? source : `(?<${group}>${source})`;

/** An hour, then minutes after the language's separator: "9", "9:30" ("9.30" in de). */
export const hourMinutes = (separator: string, shape: HourShape = {}): string => {
  const minutes = `${separator}${named(shape.groups?.m, "\\d{2}")}`;
  const hour = named(shape.groups?.h, "\\d{1,2}");
  return `${hour}${shape.required === true ? minutes : `(?:${minutes})?`}`;
};
