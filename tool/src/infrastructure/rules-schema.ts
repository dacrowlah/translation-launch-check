import { z } from "zod";
import type { Rules } from "../domain/rules";
import { ALL_CHECK_IDS, type CheckId } from "../domain/types";

const strings = z.array(z.string());
const table = z.record(z.string(), z.string());
const entry = z.array(z.string().min(1)).min(1);
const names = (size: number) => z.record(z.string(), z.array(entry).length(size));
const compiles = (source: string) => {
  try {
    return new RegExp(source, "u") instanceof RegExp;
  } catch {
    return false;
  }
};
const pattern = z.string().refine(compiles, "not a valid regular expression");
const patterns = z.array(pattern);
const count = z.number().int().positive();
const severity = z.enum(["blocker", "warning", "info"]);

const locale = z.strictObject({
  language: z.string(),
  script: z.enum(["latin", "japanese"]),
  decimal: z.string(),
  group: strings,
  formality: z.enum(["formal", "not_applicable"]),
  date_order: z.enum(["mdy", "dmy"]).exactOptional(),
  length_ratio_max: z.number().positive().exactOptional(),
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
  merge_tag_patterns: patterns,
  promo_code_pattern: pattern,
  artifact_patterns: patterns,
  artifact_phrases: strings,
  currencies: table,
  calendar: z.strictObject({ months: names(12), weekdays: names(7) }),
  formality_markers: z.record(z.string(), z.strictObject({ formal: strings, informal: strings })),
  glossary,
  accepted_loanwords: z.record(z.string(), strings),
  language_check: z.strictObject({ min_letters: count }),
});

const glossaryLocales = ({ glossary: g }: Rules): string[] => [
  ...Object.keys(g.forbidden),
  ...Object.keys(g.approved_translations),
];

const references = (r: Rules): [string, string[]][] => [
  ["master_locale", [r.master_locale]],
  ["locale_aliases", Object.values(r.locale_aliases)],
  ["glossary", glossaryLocales(r)],
  ["spelling", Object.keys(r.spelling)],
];

const languageIssues = (r: Rules): string[] => {
  const used = new Set(Object.values(r.locales).map((l) => l.language));
  return Object.keys(r.accepted_loanwords)
    .filter((k) => !used.has(k))
    .map((k) => `accepted_loanwords: unknown language ${k}`);
};

const crossIssues = (r: Rules): string[] => [
  ...references(r).flatMap(([label, keys]) =>
    keys.filter((k) => !(k in r.locales)).map((k) => `${label}: unknown locale ${k}`),
  ),
  ...languageIssues(r),
];

/** Start-up only: throws a ZodError when config/rules.json is invalid. */
export const parseRules = (json: unknown): Rules => {
  const rules: Rules = shape.parse(json);
  const message = crossIssues(rules).join("; ");
  if (message) throw new Error(`invalid rules: ${message}`);
  return rules;
};
