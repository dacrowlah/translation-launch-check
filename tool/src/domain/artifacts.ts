import { multisetDiff } from "./checks/compare.js";
import type { Rules } from "./rules.js";
import { extractMergeTags, mergeTagName, normalizedOnlyTags } from "./tokens/merge-tags.js";
import { escape } from "./tokens/regex.js";
import { unique } from "./tokens/tally.js";

const matchesOf = (text: string, patterns: readonly string[], flags: string): string[] =>
  patterns.flatMap((pattern) => [...text.matchAll(new RegExp(pattern, flags))].map((m) => m[0]));

/** An artifact and its first span in the text (every artifact is text as written). */
interface Placed {
  readonly item: string;
  readonly start: number;
  readonly end: number;
}

const placed = (text: string, item: string): Placed => {
  const start = text.indexOf(item);
  return { item, start, end: start + item.length };
};

const within = (a: Placed, b: Placed): boolean => a !== b && b.start <= a.start && a.end <= b.end;

/**
 * Each artifact once, in order of first appearance; one that lies inside another's span is part
 * of it ("[first_name]" inside "[[first_name]]" is one leftover).
 */
const inTextOrder = (text: string, found: readonly string[]): string[] => {
  const all = unique(found).map((item) => placed(text, item));
  const outer = all.filter((a) => !all.some((b) => within(a, b)));
  return outer.sort((a, b) => a.start - b.start).map((p) => p.item);
};

const leftovers = (text: string, rules: Rules): string[] => [
  ...matchesOf(text, rules.artifact_patterns, "gu"),
  ...matchesOf(text, rules.artifact_phrases.map(escape), "giu"),
];

/** Leftover placeholders and prompt text, each once, in text order. Merge tags are not read here. */
export const findArtifacts = (text: string, rules: Rules): string[] =>
  inTextOrder(text, leftovers(text, rules));

const curlyTags = (text: string, rules: Rules): string[] =>
  extractMergeTags(text, rules).mergeTags.filter((tag) => tag.startsWith("{{"));

/** {{tags}} whose name the master lacks; none without a master (a merge tag is legitimate copy). */
const newTags = (text: string, master: string | null, rules: Rules): string[] =>
  master === null
    ? []
    : multisetDiff(curlyTags(master, rules), curlyTags(text, rules), mergeTagName).extra;

/**
 * What copy fit lists, each once, in text order: {{tags}} the master lacks, tags written with
 * full-width characters (broken as sent) and the leftovers. localization_check leaves tags to
 * merge_tags.
 */
export const copyFitArtifacts = (text: string, master: string | null, rules: Rules): string[] =>
  inTextOrder(text, [
    ...newTags(text, master, rules),
    ...normalizedOnlyTags(text, rules),
    ...leftovers(text, rules),
  ]);
