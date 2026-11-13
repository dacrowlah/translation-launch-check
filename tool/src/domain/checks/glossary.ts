import {
  resultOf,
  type LinePair,
  type LocaleContext,
  type MultiCheck,
  type Row,
  type Spec,
} from "./compare";
import { withoutSpans } from "./spans";
import { dntTerms, termsPattern } from "./terms";
import { wholeWords } from "./words";

export const GLOSSARY_DNT_DETAIL = "A do-not-translate term is missing or was translated.";
export const GLOSSARY_FORBIDDEN_DETAIL = "A forbidden term is used.";

const DNT: Spec = { check: "glossary_dnt", detail: GLOSSARY_DNT_DETAIL };
const FORBIDDEN: Spec = { check: "glossary_forbidden", detail: GLOSSARY_FORBIDDEN_DETAIL };

/** Terms found in the text, longest first; a match is used up so "TrailPro" ignores "TrailPro Ultra". */
const present = (text: string, [term, ...more]: readonly string[]): string[] => {
  if (term === undefined) return [];
  const pattern = termsPattern([term]);
  return [...(pattern.test(text) ? [term] : []), ...present(text.replace(pattern, " "), more)];
};

const kept = (pair: LinePair, term: string, ctx: LocaleContext): boolean => {
  const approved = ctx.rules.glossary.approved_translations[pair.locale]?.[term];
  const target = withoutSpans(pair.targetText, ctx.rules);
  return termsPattern([term]).test(target) || target.includes(approved ?? "\0");
};

const dntResult = (pair: LinePair, ctx: LocaleContext) => {
  const master = withoutSpans(pair.masterText, ctx.rules);
  const terms = present(master, dntTerms(ctx.rules));
  const rows = terms.filter((term) => !kept(pair, term, ctx)).map((term): Row => [term, undefined]);
  return resultOf(ctx.rules, DNT, terms.length > 0, rows);
};

const forbiddenIn = (pair: LinePair, list: readonly string[], ctx: LocaleContext): string[] => {
  const text = withoutSpans(pair.targetText, ctx.rules);
  return [...new Set([...text.matchAll(wholeWords(list, "giu"))].map((m) => m[0]))];
};

const forbiddenResult = (pair: LinePair, ctx: LocaleContext) => {
  const list = ctx.rules.glossary.forbidden[pair.locale] ?? [];
  const rows = forbiddenIn(pair, list, ctx).map((hit): Row => [undefined, hit]);
  return resultOf(ctx.rules, FORBIDDEN, list.length > 0, rows);
};

export const checkGlossary: MultiCheck = (pair, ctx) => ({
  glossary_dnt: dntResult(pair, ctx),
  glossary_forbidden: forbiddenResult(pair, ctx),
});
