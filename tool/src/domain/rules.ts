import type { CheckId, Severity, Unit } from "./types";

type Strings = readonly string[];
type Table = Readonly<Record<string, string>>;

export interface Limits {
  readonly max_file_bytes: number;
  readonly max_lines: number;
  readonly max_targets: number;
  readonly max_cell_chars: number;
}
export interface LocaleRule {
  readonly language: string;
  readonly script: "latin" | "japanese";
  readonly decimal: string;
  readonly group: Strings;
  readonly formality: "formal" | "not_applicable";
  readonly date_order?: "mdy" | "dmy";
  readonly length_ratio_max?: number;
  readonly typography?: { readonly space_before: Strings; readonly guillemets: boolean };
}
export interface ChannelRule {
  readonly channel: string;
  readonly field: string;
  readonly limit: number | null;
  readonly unit: Unit;
  readonly soft: boolean;
}
export interface Spelling {
  readonly "en-GB": {
    readonly words: Table;
    readonly ize_to_ise: boolean;
    readonly ize_exceptions: Strings;
  };
  readonly "de-CH": { readonly chars: Table };
}
/** Names per month or weekday: full name first, then abbreviations (Monday first for weekdays). */
export interface Calendar {
  readonly months: Readonly<Record<string, readonly Strings[]>>;
  readonly weekdays: Readonly<Record<string, readonly Strings[]>>;
}
export interface Glossary {
  readonly do_not_translate: Strings;
  readonly approved_translations: Readonly<Record<string, Table>>;
  readonly forbidden: Readonly<Record<string, Strings>>;
}
export interface Lexicon {
  readonly formal: Strings;
  readonly informal: Strings;
}

/** The shape of config/rules.json (contract section 6). */
export interface Rules {
  readonly version: string;
  readonly effective_date: string;
  readonly limits: Limits;
  readonly master_locale: string;
  readonly locales: Readonly<Record<string, LocaleRule>>;
  readonly locale_aliases: Table;
  readonly channels: readonly ChannelRule[];
  readonly severities: Readonly<Record<CheckId, Severity>>;
  readonly spelling: Spelling;
  readonly trademark_symbols: Strings;
  readonly void_tags: Strings;
  readonly time_expressions: Readonly<Record<string, Strings>>;
  readonly time_zones: Strings;
  readonly merge_tag_patterns: Strings;
  readonly promo_code_pattern: string;
  readonly artifact_patterns: Strings;
  readonly artifact_phrases: Strings;
  readonly currencies: Table;
  readonly calendar: Calendar;
  readonly formality_markers: Readonly<Record<string, Lexicon>>;
  readonly glossary: Glossary;
  readonly language_check: { readonly min_letters: number };
}
