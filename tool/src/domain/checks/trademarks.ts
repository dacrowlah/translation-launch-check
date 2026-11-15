import type { Rules } from "../rules.js";
import { listCheck } from "./compare.js";

export const TRADEMARKS_DETAIL = "A trademark symbol is missing or added.";

const ASCII_FORMS: Readonly<Record<string, string>> = {
  "(TM)": "\u2122",
  "(R)": "\u00ae",
  "(C)": "\u00a9",
};

const symbolsIn = (text: string, rules: Rules): string[] => {
  const symbols = text.replace(/\((?:TM|R|C)\)/gu, (form) => ASCII_FORMS[form] ?? form);
  return [...symbols].filter((char) => rules.trademark_symbols.includes(char));
};

export const checkTrademarks = listCheck(
  { check: "trademark_symbols", detail: TRADEMARKS_DETAIL },
  (p, rules) => [symbolsIn(p.masterText, rules), symbolsIn(p.targetText, rules)],
);
