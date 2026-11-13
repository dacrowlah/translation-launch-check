import { z } from "zod";
import type { Limits } from "../domain/rules";

const NAME_MAX = 40;
const CAMPAIGN_MAX = 100;
const LOCALE = /^[a-z]{2}-[A-Z]{2}$/;
const MASTER = "en-US";

const text = (limits: Limits) => z.string().max(limits.max_cell_chars);
const name = () => z.string().max(NAME_MAX);

const lineShape = (limits: Limits) => ({
  id: name(),
  channel: name(),
  field: name(),
  texts: z.record(z.string().regex(LOCALE), text(limits)),
});

const localesField = (limits: Limits) =>
  z
    .array(z.string().regex(LOCALE))
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

export const localizationShape = (limits: Limits) => ({
  campaign: z.string().max(CAMPAIGN_MAX).describe("Campaign name. Never logged"),
  master_locale: z.literal(MASTER).describe("Always en-US"),
  locales: localesField(limits),
  lines: linesField(limits),
});

export const copyFitShape = (limits: Limits) => ({ items: itemsField(limits) });

type Pkg = { locales: string[]; lines: { texts: Record<string, string> }[] };
type Issue = Parameters<z.RefinementCtx["addIssue"]>[0];

const textsMatch = (texts: Record<string, string>, wanted: readonly string[]): boolean =>
  Object.keys(texts).length === wanted.length && wanted.every((locale) => locale in texts);

const localesProblem = (locales: readonly string[]): string | null => {
  if (locales.includes(MASTER)) return "the master is not a target";
  return new Set(locales).size === locales.length ? null : "duplicate locale";
};

const textsIssues = (pkg: Pkg): Issue[] =>
  pkg.lines.flatMap((line, i) =>
    textsMatch(line.texts, [MASTER, ...pkg.locales])
      ? []
      : [{ code: "custom" as const, path: ["lines", i, "texts"], message: "locale mismatch" }],
  );

const localeIssues = (pkg: Pkg): Issue[] => {
  const problem = localesProblem(pkg.locales);
  return problem ? [{ code: "custom", path: ["locales"], message: problem }] : [];
};

/** The full check: the shape, plus unique targets and "texts holds exactly master + targets". */
export const localizationSchema = (limits: Limits) =>
  z.object(localizationShape(limits)).superRefine((pkg, ctx) => {
    [...localeIssues(pkg), ...textsIssues(pkg)].forEach((issue) => ctx.addIssue(issue));
  });

export const copyFitSchema = (limits: Limits) => z.object(copyFitShape(limits));
