import type { Rules } from "../rules.js";
import { perRules } from "./per-rules.js";
import { takeWith } from "./take.js";

export const promoPattern = perRules((rules) => new RegExp(rules.promo_code_pattern, "gu"));

export const extractPromoCodes = (
  text: string,
  rules: Rules,
): { promoCodes: string[]; rest: string } => {
  const { items, rest } = takeWith(text, promoPattern(rules), (m) => m[0]);
  return { promoCodes: items, rest };
};
