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
  texts: z.record(z.string(), text(limits)),
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

/** The full check: the shape plus "texts holds the master and every target locale". */
export const localizationSchema = (limits: Limits) =>
  z.object(localizationShape(limits)).superRefine((pkg, ctx) => {
    const wanted = [MASTER, ...pkg.locales];
    pkg.lines.forEach((line, i) => {
      if (wanted.some((locale) => !(locale in line.texts)))
        ctx.addIssue({ code: "custom", path: ["lines", i, "texts"], message: "missing locale" });
    });
  });

export const copyFitSchema = (limits: Limits) => z.object(copyFitShape(limits));
