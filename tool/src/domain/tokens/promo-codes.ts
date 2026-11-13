import type { Rules } from "../rules";
import { take } from "./take";

export const extractPromoCodes = (
  text: string,
  rules: Rules,
): { codes: string[]; rest: string } => {
  const { taken, rest } = take(text, new RegExp(rules.promo_code_pattern, "gu"));
  return { codes: taken, rest };
};
