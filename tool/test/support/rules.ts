import { readFileSync } from "node:fs";
import type { LocaleRule, Rules } from "../../src/domain/rules";
import { parseRules } from "../../src/infrastructure/rules-schema";

const RULES_PATH = new URL("../../config/rules.json", import.meta.url);

/** The parsed JSON of the real config/rules.json, unvalidated. */
export const rawRules = (): Record<string, unknown> =>
  JSON.parse(readFileSync(RULES_PATH, "utf8")) as Record<string, unknown>;

export const testRules = (): Rules => parseRules(rawRules());

/** One locale's rule from the real rules file; throws on an unknown code. */
export const testLocale = (code: string): LocaleRule => {
  const rule = testRules().locales[code];
  if (!rule) throw new Error(`no test locale ${code}`);
  return rule;
};
