import { z } from "zod";
import type { Rules } from "../domain/rules";
import { ALL_CHECK_IDS, type CheckId } from "../domain/types";

const strings = z.array(z.string());
const table = z.record(z.string(), z.string());
const names = z.record(z.string(), z.array(strings));
const count = z.number().int().positive();
const severity = z.enum(["blocker", "warning", "info"]);

const locale = z.object({
  language: z.string(),
  script: z.enum(["latin", "japanese"]),
  decimal: z.string(),
  group: strings,
  formality: z.enum(["formal", "not_applicable"]),
  date_order: z.enum(["mdy", "dmy"]).exactOptional(),
  length_ratio_max: z.number().positive().exactOptional(),
  typography: z.object({ space_before: strings, guillemets: z.boolean() }).exactOptional(),
});
const channel = z.object({
  channel: z.string(),
  field: z.string(),
  limit: count.nullable(),
  unit: z.enum(["chars", "ads_chars", "sms_segments"]),
  soft: z.boolean(),
});
/** Exactly the ALL_CHECK_IDS keys: a missing or an unknown check id is rejected. */
const severities = z.strictObject(
  Object.fromEntries(ALL_CHECK_IDS.map((id) => [id, severity])) as Record<CheckId, typeof severity>,
);
const spelling = z.object({
  "en-GB": z.object({ words: table, ize_to_ise: z.boolean(), ize_exceptions: strings }),
  "de-CH": z.object({ chars: table }),
});
const glossary = z.object({
  do_not_translate: strings,
  approved_translations: z.record(z.string(), table),
  forbidden: z.record(z.string(), strings),
});

const rulesSchema = z.object({
  version: z.string().min(1),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limits: z.object({
    max_file_bytes: count,
    max_lines: count,
    max_targets: count,
    max_cell_chars: count,
  }),
  master_locale: z.string(),
  locales: z.record(z.string(), locale),
  locale_aliases: table,
  channels: z.array(channel),
  severities,
  spelling,
  trademark_symbols: strings,
  void_tags: strings,
  time_expressions: z.record(z.string(), strings),
  time_zones: strings,
  merge_tag_patterns: strings,
  promo_code_pattern: z.string(),
  artifact_patterns: strings,
  artifact_phrases: strings,
  currencies: table,
  calendar: z.object({ months: names, weekdays: names }),
  formality_markers: z.record(z.string(), z.object({ formal: strings, informal: strings })),
  glossary,
  language_check: z.object({ min_letters: count }),
});

/** Start-up only: throws a ZodError when config/rules.json is invalid. */
export const parseRules = (json: unknown): Rules => rulesSchema.parse(json);
