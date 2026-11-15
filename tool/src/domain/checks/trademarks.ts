import type { Rules } from "../rules.js";
import { listCheck } from "./compare.js";
import { visibleText } from "./spans.js";

export const TRADEMARKS_DETAIL = "A trademark symbol is missing or added.";

const ASCII_FORMS: Readonly<Record<string, string>> = {
  "(TM)": "\u2122",
  "(R)": "\u00ae",
  "(C)": "\u00a9",
};

/** The symbols in the visible copy: "&trade;" counts as "\u2122", an attribute never counts. */
const symbolsIn = (text: string, rules: Rules): string[] => {
  const symbols = visibleText(text, rules).replace(
    /\((?:TM|R|C)\)/gu,
    (form) => ASCII_FORMS[form] ?? form,
  );
  return [...symbols].filter((char) => rules.trademark_symbols.includes(char));
};

export const checkTrademarks = listCheck(
  { check: "trademark_symbols", detail: TRADEMARKS_DETAIL },
  (p, rules) => [symbolsIn(p.masterText, rules), symbolsIn(p.targetText, rules)],
);
