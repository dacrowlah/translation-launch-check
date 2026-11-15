import { z } from "zod";
import { LOCALE_CODE } from "../domain/locale-code.js";
import type { Limits, Rules } from "../domain/rules.js";

const NAME_MAX = 40;
const CAMPAIGN_MAX = 100;

/** At most `max` characters, counted in code points as the workflow counts them. */
const chars = (max: number) => z.string().refine((s) => [...s].length <= max);
const text = (limits: Limits) => chars(limits.max_cell_chars);
const name = () => chars(NAME_MAX);

const lineShape = (limits: Limits) => ({
  id: name(),
  channel: name(),
  field: name(),
  texts: z.record(z.string().regex(LOCALE_CODE), text(limits)),
});

const localesField = (limits: Limits) =>
  z
    .array(z.string().regex(LOCALE_CODE))
    .min(1)
    .max(limits.max_targets)
    .describe("Target locales such as de-DE; the master is not repeated");

const linesField = (limits: Limits) =>
  z
    .array(z.object(lineShape(limits)))
    .min(1)
    .max(limits.max_lines)
    .describe("Lines: id, channel, field and texts (locale -> text, master included)");

const itemShape = (limits: Limits) => ({
  channel: name(),
  field: name(),
  text: text(limits),
  master: text(limits).exactOptional(),
});

const itemsField = (limits: Limits) =>
  z
    .array(z.object(itemShape(limits)))
    .min(1)
    .max(limits.max_lines)
    .describe("Items to measure: channel, field, text and optionally the master text");

export const localizationShape = (rules: Rules) => ({
  campaign: chars(CAMPAIGN_MAX).describe("Campaign name. Never logged"),
  master_locale: z.literal(rules.master_locale).describe(`Always ${rules.master_locale}`),
  locales: localesField(rules.limits),
  lines: linesField(rules.limits),
});

export const copyFitShape = (limits: Limits) => ({ items: itemsField(limits) });

type Pkg = { master_locale: string; locales: string[]; lines: { texts: Record<string, string> }[] };
type Issue = Parameters<z.RefinementCtx["addIssue"]>[0];

const textsMatch = (texts: Record<string, string>, wanted: readonly string[]): boolean =>
  Object.keys(texts).length === wanted.length && wanted.every((locale) => locale in texts);

const localesProblem = ({ master_locale, locales }: Pkg): string | null => {
  if (locales.includes(master_locale)) return "the master is not a target";
  return new Set(locales).size === locales.length ? null : "duplicate locale";
};

const textsIssues = (pkg: Pkg): Issue[] =>
  pkg.lines.flatMap((line, i) =>
    textsMatch(line.texts, [pkg.master_locale, ...pkg.locales])
      ? []
      : [{ code: "custom" as const, path: ["lines", i, "texts"], message: "locale mismatch" }],
  );

const localeIssues = (pkg: Pkg): Issue[] => {
  const problem = localesProblem(pkg);
  return problem ? [{ code: "custom", path: ["locales"], message: problem }] : [];
};

/** The full check: the shape, plus unique targets and "texts holds exactly master + targets". */
export const localizationSchema = (rules: Rules) =>
  z.object(localizationShape(rules)).superRefine((pkg, ctx) => {
    [...localeIssues(pkg), ...textsIssues(pkg)].forEach((issue) => ctx.addIssue(issue));
  });

export const copyFitSchema = (limits: Limits) => z.object(copyFitShape(limits));
