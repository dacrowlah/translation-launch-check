import { readFileSync } from "node:fs";
import { z } from "zod";
import type { LocaleRule, Rules } from "../../src/domain/rules.js";
import { parseRules } from "../../src/infrastructure/rules-schema.js";

const RULES_PATH = new URL("../../config/rules.json", import.meta.url);

/** The parsed JSON of the real config/rules.json, unvalidated. */
export const rawRules = (): Record<string, unknown> =>
  JSON.parse(readFileSync(RULES_PATH, "utf8")) as Record<string, unknown>;

let parsed: Rules | undefined;

/** One parsed instance for every test, as in production. */
export const testRules = (): Rules => (parsed ??= parseRules(rawRules()));

/** One locale's rule from the real rules file; throws on an unknown code. */
export const testLocale = (code: string): LocaleRule => {
  const rule = testRules().locales[code];
  if (!rule) throw new Error(`no test locale ${code}`);
  return rule;
};

const named = (issue: z.core.$ZodIssue): string => `${issue.path.join(".")}: ${issue.message}`;

/** What parseRules says of a rules JSON: each zod issue as "path: message", the cross-check's message, or "accepted". */
export const rejection = (json: unknown): string => {
  try {
    parseRules(json);
  } catch (error) {
    return error instanceof z.ZodError ? error.issues.map(named).join("; ") : String(error);
  }
  return "accepted";
};
