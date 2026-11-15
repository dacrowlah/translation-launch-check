import type { Rules } from "../rules.js";
import { mergeTagSource } from "../tokens/merge-tags.js";
import { perRules } from "../tokens/per-rules.js";
import { decodeReference } from "../tokens/references.js";
import { anyOfSources, NO_BREAK_SPACES } from "../tokens/regex.js";
import { cutOf, gapsBetween, interleaved, takeWith } from "../tokens/take.js";
import { BREAK, LINKS, MARKUP } from "./span-sources.js";
import { dntSource } from "../tokens/terms.js";

/** glued: a token that text may touch ("{{name}}s"); tags and references are word breaks. */
interface Segment {
  readonly text: string;
  readonly span: boolean;
  readonly glued: boolean;
}

const anyOf = (sources: readonly string[]): RegExp => new RegExp(anyOfSources(sources), "gu");

/** URLs, bare domains and merge tags (case-sensitive): text a check must not read or rewrite. */
const linksAndTags = perRules((rules) => anyOf([...LINKS, mergeTagSource(rules)]));

/** Everything that is not copy: markup, links, emails, merge tags, codes, DNT terms. */
const protectedPattern = perRules((rules) => {
  const tokens = [mergeTagSource(rules), rules.promo_code_pattern];
  return anyOf([...MARKUP, ...LINKS, ...tokens, dntSource(rules)]);
});

const gap = (text: string): Segment => ({ text, span: false, glued: false });
const span = (text: string): Segment => ({ text, span: true, glued: !BREAK.test(text) });

/** The text as alternating gaps and spans, in order (one pass, no copying per match). */
const segmentsOf = (text: string, pattern: RegExp): Segment[] => {
  const matches = [...text.matchAll(pattern)];
  const gaps = gapsBetween(text, matches.map(cutOf)).map(gap);
  return interleaved(
    gaps,
    matches.map((m) => span(m[0])),
  );
};

export const withoutSpans = (text: string, rules: Rules): string =>
  takeWith(text, linksAndTags(rules), (m) => m[0]).rest;

export const protectedSpans = (text: string, rules: Rules): string[] =>
  segmentsOf(text, protectedPattern(rules))
    .filter((s) => s.span)
    .map((s) => s.text);

/** Where a span was removed: one mark, which becomes a single space below. */
const REMOVED = "\u{10fffd}";
const AROUND = ` \\t\\r\\n${NO_BREAK_SPACES}`;
const GAP_RUN = new RegExp(`[${AROUND}]*\\u{10fffd}[\\u{10fffd}${AROUND}]*`, "gu");
const NO_BREAK = new RegExp(`[${NO_BREAK_SPACES}]`, "u");

const shown = (segment: Segment): string => {
  if (!segment.span) return segment.text;
  return segment.text.startsWith("&") ? decodeReference(segment.text) : REMOVED;
};

/** A run of spaces around a removed span is one space; a no-break space in it is kept. */
const oneSpace = (run: string): string => run.match(NO_BREAK)?.[0] ?? " ";

/** Removed spans and the spaces around them become one space; ASCII spaces collapse. */
const spaced = (text: string): string =>
  text
    .replace(GAP_RUN, oneSpace)
    .replace(/[ \t\r\n]+/gu, " ")
    .trim();

/** The copy a reader sees: each span is one space, references decoded. */
export const visibleText = (text: string, rules: Rules): string =>
  spaced(segmentsOf(text, protectedPattern(rules)).map(shown).join(""));

type Fix = (match: string) => string;
interface Edges {
  readonly before: boolean;
  readonly after: boolean;
}

/** A match at an edge glued to a token is part of that token and stays as written. */
const kept = (m: RegExpExecArray, text: string, edges: Edges): boolean =>
  (edges.before && m.index === 0) || (edges.after && m.index + m[0].length === text.length);

const rewriteGap = (text: string, words: RegExp, fix: Fix, edges: Edges): string => {
  const matches = [...text.matchAll(words)];
  const fixed = matches.map((m) => (kept(m, text, edges) ? m[0] : fix(m[0])));
  return interleaved(gapsBetween(text, matches.map(cutOf)), fixed).join("");
};

const edgesOf = (segments: readonly Segment[], i: number): Edges => ({
  before: segments[i - 1]?.glued === true,
  after: segments[i + 1]?.glued === true,
});

/** Rewrites matches of `words` in the gaps between spans; every span stays as written. */
const rewriteGaps = (text: string, spans: RegExp, words: RegExp, fix: Fix): string => {
  const segments = segmentsOf(text, spans);
  const each = (s: Segment, i: number) =>
    s.span ? s.text : rewriteGap(s.text, words, fix, edgesOf(segments, i));
  return segments.map(each).join("");
};

/** Rewrites every match of `pattern` (case-insensitive) outside a link or merge tag. */
export const rewriteOutside = (text: string, rules: Rules, pattern: string, fix: Fix): string =>
  rewriteGaps(text, linksAndTags(rules), new RegExp(pattern, "giu"), fix);

/** A match must not touch a letter, digit or underscore, so "COLOR20" and "colors_x" stay whole. */
const standalone = (pattern: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "giu");

/** Rewrites matches of `pattern` in the visible text only; each protected span stays as written. */
export const rewriteVisible = (text: string, rules: Rules, pattern: string, fix: Fix): string =>
  rewriteGaps(text, protectedPattern(rules), standalone(pattern), fix);
