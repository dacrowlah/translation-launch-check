import { readFileSync } from "node:fs";

type ByCategory = Record<string, string[]>;
interface Cases {
  readonly corpus: Record<string, ByCategory>;
  readonly hard: Record<string, string[]>;
}
export interface Case {
  readonly lang: string;
  readonly text: string;
}

const PATH = new URL("../fixtures/language-cases.json", import.meta.url);
const cases = (): Cases => JSON.parse(readFileSync(PATH, "utf8")) as Cases;

const tagged = ([lang, lines]: [string, string[]]): Case[] => lines.map((text) => ({ lang, text }));

const corpusCases = (corpus: Cases["corpus"]): Case[] =>
  Object.entries(corpus).flatMap(([lang, cats]) => tagged([lang, Object.values(cats).flat()]));

/** Every fixture line in a latin-script language (de, fr, en), tagged with its language. */
export const latinCases = (): Case[] => {
  const { corpus, hard } = cases();
  const all = [...corpusCases(corpus), ...Object.entries(hard).flatMap(tagged)];
  return all.filter((c) => c.lang !== "ja");
};

/** A long fixture paragraph for a language: the corpus "long" lines joined. */
export const paragraph = (lang: string): string => (cases().corpus[lang]?.["long"] ?? []).join(" ");
