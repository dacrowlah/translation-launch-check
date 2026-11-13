import type { Rules } from "../rules";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";
import { withoutSpans } from "./spans";
import { wholeWords } from "./words";

export const TIME_ZONE_DETAIL = "A time or deadline has no time zone.";

const TIME_ZONE: Spec = { check: "time_zone", detail: TIME_ZONE_DETAIL };

const isCode = (zone: string): boolean => zone === zone.toUpperCase();

/** Upper-case codes ("CET") match exactly; phrases ("heure de Paris") ignore case. */
const hasZone = (text: string, rules: Rules): boolean =>
  wholeWords(rules.time_zones.filter(isCode), "u").test(text) ||
  wholeWords(
    rules.time_zones.filter((zone) => !isCode(zone)),
    "iu",
  ).test(text);

const timeIn = (text: string, sources: readonly string[]): string | undefined =>
  sources.length === 0
    ? undefined
    : text.match(new RegExp(sources.map((s) => `(?:${s})`).join("|"), "iu"))?.[0];

export const checkTimeZone: LineCheck = (pair, ctx) => {
  const language = ctx.rules.locales[pair.locale]?.language ?? "";
  const text = withoutSpans(pair.targetText, ctx.rules);
  const time = timeIn(text, ctx.rules.time_expressions[language] ?? []);
  const rows: Row[] = time === undefined || hasZone(text, ctx.rules) ? [] : [[undefined, time]];
  return resultOf(ctx.rules, TIME_ZONE, time !== undefined, rows);
};
