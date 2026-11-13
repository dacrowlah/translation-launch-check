import type { Rules } from "./rules";
import { multisetDiff } from "./checks/compare";
import { extractMergeTags } from "./tokens/merge-tags";

const matchesOf = (text: string, patterns: readonly string[], flags: string): string[] =>
  patterns.flatMap((pattern) => [...text.matchAll(new RegExp(pattern, flags))].map((m) => m[0]));

const escaped = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const newTags = (text: string, master: string | null, rules: Rules): string[] => {
  if (master === null) return [];
  const tags = (s: string): string[] =>
    extractMergeTags(s, rules).tags.filter((tag) => tag.startsWith("{{"));
  return multisetDiff(tags(master), tags(text)).extra;
};

/** Leftover placeholders and prompt text; a {{tag}} counts only when the master lacks it. */
export const findArtifacts = (text: string, master: string | null, rules: Rules): string[] => [
  ...newTags(text, master, rules),
  ...matchesOf(text, rules.artifact_patterns, "gu"),
  ...matchesOf(text, rules.artifact_phrases.map(escaped), "giu"),
];
