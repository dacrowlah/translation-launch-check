import type { Rules } from "../rules";

/** URLs and merge tags: text a wording check must not read or rewrite. */
const spanSource = (rules: Rules): string =>
  ["https?:\\/\\/\\S+", ...rules.merge_tag_patterns].map((p) => `(?:${p})`).join("|");

export const withoutSpans = (text: string, rules: Rules): string =>
  text.replace(new RegExp(spanSource(rules), "gu"), " ");

const isSpan = (args: readonly unknown[]): boolean =>
  Boolean((args.at(-1) as { span?: string }).span);

/** Rewrites every match of `pattern` that lies outside a URL or merge tag. */
export const rewriteOutside = (
  text: string,
  rules: Rules,
  pattern: string,
  fix: (match: string) => string,
): string =>
  text.replace(
    new RegExp(`(?<span>${spanSource(rules)})|${pattern}`, "giu"),
    (match, ...args: unknown[]) => (isSpan(args) ? match : fix(match)),
  );
