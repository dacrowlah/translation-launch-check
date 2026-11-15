import { z } from "zod";
import type { Rules } from "../domain/rules";
import { patternIssues } from "../domain/tokens/pattern-issues";
import { ALL_CHECK_IDS, type CheckId } from "../domain/types";
import { crossIssues } from "./rules-cross-checks";
import { compiles, isTemplate } from "./rules-patterns";

const strings = z.array(z.string());
const table = z.record(z.string(), z.string());
const name = z.string().min(1);
const char = z.string().refine((s) => [...s].length === 1, "not one character");
const entry = z.strictObject({ full: z.array(name).min(1), short: z.array(name) });
const names = (size: number) => z.record(z.string(), z.array(entry).length(size));
const pattern = z.string().refine(compiles, "not a valid regular expression");
const patterns = z.array(pattern);
const template = z.string().refine(isTemplate, "not a valid template");
const timeFormat = z.union([pattern, z.strictObject({ pattern, candidate: z.boolean() })]);
/** A time of day, 00:00 to 23:59. */
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const count = z.number().int().positive();
/** 10, 100, 1000 ...: a number multiplier only moves the decimal point. */
const powerOfTen = z
  .number()
  .int()
  .refine((n) => n > 1 && /^10*$/u.test(String(n)));
/** The default reading of 12 o'clock, then at most one more. */
const readings = z
  .array(z.union([z.literal(0), z.literal(12)]))
  .min(1)
  .max(2);
const severity = z.enum(["blocker", "warning", "info"]);

const locale = z.strictObject({
  language: z.string(),
  script: z.enum(["latin", "japanese"]),
  decimal: z.string(),
  group: strings,
  formality: z.enum(["formal", "not_applicable"]),
  date_order: z.enum(["mdy", "dmy"]).exactOptional(),
  dotted_dates: z.boolean().exactOptional(),
  length_ratio_max: z.number().positive().exactOptional(),
  currencies: table.exactOptional(),
  typography: z.strictObject({ space_before: strings, guillemets: z.boolean() }).exactOptional(),
});
const channel = z.strictObject({
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
const spelling = z.strictObject({
  "en-GB": z.strictObject({ words: table, ize_to_ise: z.boolean(), ize_exceptions: strings }),
  "de-CH": z.strictObject({ chars: table }),
});
const glossary = z.strictObject({
  do_not_translate: strings,
  approved_translations: z.record(z.string(), table),
  forbidden: z.record(z.string(), strings),
});

const shape = z.strictObject({
  version: z.string().min(1),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limits: z.strictObject({
    max_file_bytes: count,
    max_lines: count,
    max_targets: count,
    max_cell_chars: count,
  }),
  master_locale: z.literal("en-US"),
  locales: z.record(z.string(), locale),
  locale_aliases: table,
  channels: z.array(channel),
  severities,
  spelling,
  trademark_symbols: strings,
  void_tags: strings,
  time_expressions: z.record(z.string(), patterns),
  time_zones: strings,
  percent_words: z.record(name, patterns),
  percent_range_connectors: z.record(name, patterns),
  time_formats: z.record(name, z.array(timeFormat)),
  time_words: z.record(name, z.record(name, clock)),
  time_range_connectors: z.record(name, z.array(name)),
  time_start_prefixes: z.record(name, pattern),
  time_split_separators: z.record(name, z.array(name)),
  time_minute_separators: z.record(name, z.array(char)),
  number_multipliers: z.record(name, z.record(name, powerOfTen)),
  number_multiplier_blockers: z.record(name, z.array(name)),
  twelve_oclock: z.record(name, z.strictObject({ am: readings, pm: readings })),
  merge_tag_patterns: patterns,
  promo_code_pattern: pattern,
  artifact_patterns: patterns,
  artifact_phrases: strings,
  currencies: table,
  calendar: z.strictObject({
    months: names(12),
    weekdays: names(7),
    ordinals: z.record(name, z.array(name)),
    articles: z.record(name, z.array(name)),
    date_forms: z.record(name, z.array(template)),
    range_forms: z.record(name, z.array(template)),
    weekday_after: z.record(name, z.array(template)),
  }),
  date_range_connectors: z.record(name, z.array(name)),
  formality_markers: z.record(z.string(), z.strictObject({ formal: strings, informal: strings })),
  glossary,
  accepted_loanwords: z.record(z.string(), strings),
  language_check: z.strictObject({ min_letters: count }),
});

/**
 * Start-up only: throws a ZodError when config/rules.json has the wrong shape, and an Error
 * when it points at unknown locales or its composed patterns do not compile.
 */
export const parseRules = (json: unknown): Rules => {
  const rules: Rules = shape.parse(json);
  const message = [...crossIssues(rules), ...patternIssues(rules)].join("; ");
  if (message) throw new Error(`invalid rules: ${message}`);
  return rules;
};
