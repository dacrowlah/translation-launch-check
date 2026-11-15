import type { LocaleRule } from "../rules";
import { escapeInClass } from "../tokens/regex";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";
import { withoutSpans } from "./spans";

export const TYPOGRAPHY_DETAIL = "French spacing is missing before ; : ! ? or inside guillemets.";

const TYPOGRAPHY: Spec = { check: "typography", detail: TYPOGRAPHY_DETAIL };
const NARROW = String.fromCodePoint(0x202f);
/** Whitespace, which includes the no-break and narrow no-break spaces. */
const GAP = "\\s";

const OPENING = new RegExp(`(\\u00ab)([^${GAP}])`, "gu");
const CLOSING = new RegExp(`([^${GAP}])(\\u00bb)`, "gu");

/** A mark after a space is fine, and so is one after another mark ("?!"). */
const beforeMarks = (marks: readonly string[]): RegExp => {
  const set = marks.map(escapeInClass).join("");
  return new RegExp(`([^${GAP}${set}])([${set}])`, "gu");
};

/** Each tight pair as [what it should read, what it reads]. */
const tight = (text: string, pattern: RegExp): Row[] =>
  [...text.matchAll(pattern)].map((m): Row => [`${m[1]}${NARROW}${m[2]}`, `${m[1]}${m[2]}`]);

const rowsOf = (text: string, rule: NonNullable<LocaleRule["typography"]>): Row[] => [
  ...tight(text, beforeMarks(rule.space_before)),
  ...(rule.guillemets ? [...tight(text, OPENING), ...tight(text, CLOSING)] : []),
];

export const checkTypography: LineCheck = (pair, ctx) => {
  const rule = ctx.rule.typography;
  const text = withoutSpans(pair.targetText, ctx.rules).replace(/\d{1,2}:\d{2}/gu, " ");
  return resultOf(ctx.rules, TYPOGRAPHY, rule !== undefined, rule ? rowsOf(text, rule) : []);
};
