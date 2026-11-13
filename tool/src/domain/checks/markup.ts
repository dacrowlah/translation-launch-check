import { diffRows, resultOf, type LineCheck, type Spec } from "./compare";

export const MARKUP_DETAIL = "An HTML tag is missing, extra or left unclosed.";

const SPEC: Spec = { check: "markup", detail: MARKUP_DETAIL };
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gu;

const tagsIn = (text: string): string[] =>
  [...text.matchAll(TAG)].map(([, slash, name]) => `<${slash}${name?.toLowerCase()}>`);

const cancels = (open: string | undefined, tag: string): boolean =>
  open !== undefined && tag === open.replace("<", "</");

const unmatched = (tags: readonly string[]): string[] =>
  tags.reduce<string[]>(
    (stack, tag) => (cancels(stack.at(-1), tag) ? stack.slice(0, -1) : [...stack, tag]),
    [],
  );

const isVoid = (tag: string, voids: readonly string[]): boolean =>
  voids.includes(tag.replace(/[</>]/gu, ""));

const unbalanced = (tags: readonly string[], voids: readonly string[]): string | undefined =>
  unmatched(tags.filter((tag) => !isVoid(tag, voids))).at(0);

/** The first tag left open (expected: its closer) or closed without an opener (found). */
const balanceRows = (tag: string | undefined): [string | undefined, string | undefined][] =>
  tag === undefined
    ? []
    : [tag.startsWith("</") ? [undefined, tag] : [tag.replace("<", "</"), undefined]];

export const checkMarkup: LineCheck = (pair, ctx) => {
  const [a, b] = [tagsIn(pair.masterText), tagsIn(pair.targetText)];
  const diff = diffRows(a, b);
  const rows = diff.length > 0 ? diff : balanceRows(unbalanced(b, ctx.rules.void_tags));
  return resultOf(ctx.rules, SPEC, a.length + b.length > 0, rows);
};
