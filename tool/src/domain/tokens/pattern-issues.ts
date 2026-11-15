import type { LocaleRule, Rules } from "../rules.js";
import { tokenize } from "./tokenize.js";

/** Why a pattern did not compile: the engine's reason, without the pattern itself. */
const reasonOf = (error: unknown): string =>
  error instanceof Error ? (error.message.split(": ").at(-1) ?? "") : "unknown";

const issueOf = (code: string, locale: LocaleRule, rules: Rules): string[] => {
  try {
    tokenize("", locale, rules);
    return [];
  } catch (error) {
    return [`patterns of ${code} do not compile (${reasonOf(error)})`];
  }
};

/**
 * Start-up check: every locale's patterns, composed from the rules, compile (and are cached),
 * so tokenizing never throws on rules that passed it.
 */
export const patternIssues = (rules: Rules): string[] =>
  Object.entries(rules.locales).flatMap(([code, locale]) => issueOf(code, locale, rules));
