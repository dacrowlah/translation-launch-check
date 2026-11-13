import type { Rules } from "../rules";
import { take } from "./take";

export const extractMergeTags = (text: string, rules: Rules): { tags: string[]; rest: string } => {
  const pattern = new RegExp(rules.merge_tag_patterns.map((p) => `(?:${p})`).join("|"), "gu");
  const { taken, rest } = take(text, pattern);
  return { tags: taken, rest };
};
