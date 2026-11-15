import type { Rules } from "./rules.js";
import type { CheckId, Finding } from "./types.js";

export interface FindingText {
  readonly detail: string;
  readonly expected?: string;
  readonly found?: string;
}

const textFields = (text: FindingText): Pick<Finding, "detail" | "expected" | "found"> => ({
  detail: text.detail,
  expected: text.expected ?? null,
  found: text.found ?? null,
});

/** Builds a certain finding whose severity comes from the rules file, never from the caller. */
export const makeFinding = (rules: Rules, check: CheckId, text: FindingText): Finding => ({
  check,
  severity: rules.severities[check],
  confidence: "certain",
  ...textFields(text),
});

/**
 * Builds an unsure finding: the tool could not tell, so a person should look. Its severity is
 * the rules' one `unsure_severity`, whatever the check's own; its detail is a question.
 */
export const makeUnsureFinding = (rules: Rules, check: CheckId, text: FindingText): Finding => ({
  check,
  severity: rules.unsure_severity,
  confidence: "unsure",
  ...textFields(text),
});
