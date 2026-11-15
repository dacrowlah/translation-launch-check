import type { Rules } from "../rules";
import { perRules } from "./per-rules";
import { anyOfSources } from "./regex";
import { takeWith } from "./take";

/** Every merge-tag syntax in the rules, case-sensitive; matches nothing when there are none. */
export const mergeTagSource = (rules: Rules): string => anyOfSources(rules.merge_tag_patterns);

const mergeTagPattern = perRules((rules) => new RegExp(mergeTagSource(rules), "gu"));

export const extractMergeTags = (
  text: string,
  rules: Rules,
): { mergeTags: string[]; rest: string } => {
  const { items, rest } = takeWith(text, mergeTagPattern(rules), (m) => m[0]);
  return { mergeTags: items, rest };
};

const LIQUID = /^\{\{([^|}]*)/u;
/** Only ASCII blanks pad a tag name: an ideographic space (U+3000) breaks the tag. */
const ASCII_BLANKS = /^[ \t]+|[ \t]+$/gu;

/**
 * The name a tag compares by: a "{{...}}" tag without its inner spaces and "| filter" parts
 * ({{ first_name | default: "du" }} -> {{first_name}}); other syntaxes as written.
 */
export const mergeTagName = (tag: string): string => {
  const inner = LIQUID.exec(tag)?.[1];
  return inner === undefined ? tag : `{{${inner.replace(ASCII_BLANKS, "")}}}`;
};

/** Each character's NFKC form where it keeps the length, so offsets match the text as sent. */
const folded = (text: string): string =>
  text.replace(/[^\x00-\x7f]/gu, (ch) => {
    const normal = ch.normalize("NFKC");
    return normal.length === ch.length ? normal : ch;
  });

const wholeTag = perRules((rules) => new RegExp(`^(?:${mergeTagSource(rules)})$`, "u"));

/**
 * Spans that read as a merge tag only once normalized ("\uff5b\uff5bname\uff5d\uff5d"); a tag
 * valid as sent stays one, full-width text in its default ("\uff01") included.
 */
export const normalizedOnlyTags = (text: string, rules: Rules): string[] =>
  [...folded(text).matchAll(mergeTagPattern(rules))].flatMap((m) => {
    const raw = text.slice(m.index, m.index + m[0].length);
    return wholeTag(rules).test(raw) ? [] : [raw];
  });
