import type { Rules } from "../rules.js";
import { fill } from "./date-forms.js";
import { perRules } from "./per-rules.js";
import { alternatives } from "./regex.js";
import { unique } from "./tally.js";
import { takeWith } from "./take.js";

/**
 * What may follow the digits of a digit-first code without making it one: the rules' units,
 * sizes, ordinals and clock words, plus every currency code ("512GB", "3XL", "50EUR", "2EME").
 */
const excludedSuffixes = (rules: Rules): string[] =>
  unique([...rules.promo_code_excluded_suffixes, ...Object.values(rules.currencies)]);

/** The promo code pattern with its {excluded_suffixes} place filled in. */
export const promoSource = (rules: Rules): string =>
  fill(rules.promo_code_pattern, { excluded_suffixes: alternatives(excludedSuffixes(rules)) });

export const promoPattern = perRules((rules) => new RegExp(promoSource(rules), "gu"));

export const extractPromoCodes = (
  text: string,
  rules: Rules,
): { promoCodes: string[]; rest: string } => {
  const { items, rest } = takeWith(text, promoPattern(rules), (m) => m[0]);
  return { promoCodes: items, rest };
};
