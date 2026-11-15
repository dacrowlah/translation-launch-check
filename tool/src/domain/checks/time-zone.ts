import { listOf } from "../tokens/per-language.js";
import type { Rules } from "../rules.js";
import { resultOf, type LineCheck, type LocaleContext, type Row, type Spec } from "./compare.js";
import { visibleText } from "./spans.js";
import { bounded, wholeWords } from "./words.js";

export const TIME_ZONE_DETAIL = "A time or deadline has no time zone.";

const TIME_ZONE: Spec = { check: "time_zone", detail: TIME_ZONE_DETAIL };

const isCode = (zone: string): boolean => zone === zone.toUpperCase();

/** The upper-case codes, less those that are ordinary words in the language (fr "ET"). */
const codesOf = (rules: Rules, excluded: readonly string[]): string[] =>
  rules.time_zones.filter((zone) => isCode(zone) && !excluded.includes(zone));

/** Upper-case codes ("CET") match exactly; phrases ("heure de Paris") ignore case. */
const hasZone = (text: string, rules: Rules, excluded: readonly string[]): boolean =>
  wholeWords(codesOf(rules, excluded), "u").test(text) ||
  wholeWords(
    rules.time_zones.filter((zone) => !isCode(zone)),
    "iu",
  ).test(text);

const zoneless = (text: string, ctx: LocaleContext): boolean =>
  !hasZone(text, ctx.rules, listOf(ctx.rules.time_zone_exclusions, ctx.rule));

const timeIn = (text: string, sources: readonly string[]): string | undefined =>
  sources.length === 0
    ? undefined
    : text.match(new RegExp(sources.map(bounded).join("|"), "iu"))?.[0];

export const checkTimeZone: LineCheck = (pair, ctx) => {
  const text = visibleText(pair.targetText, ctx.rules);
  const time = timeIn(text, ctx.rules.time_expressions[ctx.rule.language] ?? []);
  const rows: Row[] = time !== undefined && zoneless(text, ctx) ? [[undefined, time]] : [];
  return resultOf(ctx.rules, TIME_ZONE, time !== undefined, rows);
};
