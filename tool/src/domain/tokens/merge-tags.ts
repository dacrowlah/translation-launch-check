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
