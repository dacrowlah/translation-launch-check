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
  /** Writes day.month. dates ("29.11."). */
  readonly dotted_dates?: boolean;
  readonly length_ratio_max?: number;
  /** Currency symbols, codes or words only this locale uses ("Fr." in de-CH), beside the rest. */
  readonly currencies?: Table;
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
/** One month or weekday: full names stand alone; short forms count only next to a date. */
export interface CalendarEntry {
  readonly full: Strings;
  readonly short: Strings;
}
/** Per language, twelve months from January and seven weekdays from Monday. */
export interface Calendar {
  readonly months: Readonly<Record<string, readonly CalendarEntry[]>>;
  readonly weekdays: Readonly<Record<string, readonly CalendarEntry[]>>;
  /** Per language, the suffixes a day may take ("27th", "1er"). */
  readonly ordinals: Readonly<Record<string, Strings>>;
  /** Per language, the article a full weekday may take before its date ("Sonntag, den 29."). */
  readonly articles: Readonly<Record<string, Strings>>;
  /** Per language, date templates: {month} {month_number} {day} {ordinal} {year}. */
  readonly date_forms: Readonly<Record<string, Strings>>;
  /** Per language, extra range templates (the generic ones are in code, tokens/date-ranges.ts). */
  readonly range_forms: Readonly<Record<string, Strings>>;
  /** Per language that writes its weekday after the date: templates with {name}. */
  readonly weekday_after: Readonly<Record<string, Strings>>;
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

/**
 * A clock-time pattern. A string is a definite time ("21:30", "9 pm"); a candidate ("21 h",
 * "9\u6642") is a time only when the other side of the line holds a time too ("en 24 h").
 */
export type TimeFormat = string | { readonly pattern: string; readonly candidate: boolean };

/**
 * The hour that 12 with am and with pm stands for: the default first, then a second reading
 * that also matches the other side of the line (Japanese: am [12, 0], pm [0, 12]).
 */
export interface TwelveOClock {
  readonly am: readonly (0 | 12)[];
  readonly pm: readonly (0 | 12)[];
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
  /** Per language, patterns of words that mean "%" after a number ("30 Prozent", "prozentig"). */
  readonly percent_words: Readonly<Record<string, Strings>>;
  /**
   * Per language, patterns of what stands between two numbers that share one "%" written after
   * the second ("20 bis 50 %", "20-50 %"); never a spaced dash ("Top 5 - 50 %").
   */
  readonly percent_range_connectors: Readonly<Record<string, Strings>>;
  /** Per language, clock-time patterns with named groups h, m, half and am or pm. */
  readonly time_formats: Readonly<Record<string, readonly TimeFormat[]>>;
  /** Per language, the words or signs between the two times of a range ("9-17 Uhr"). */
  readonly time_range_connectors: Readonly<Record<string, Strings>>;
  /** Per language, a pattern before a bare range start, with groups am or pm. */
  readonly time_start_prefixes: Table;
  /** Per language, the signs between the ranges of split hours ("9-12, 14-18 Uhr"; ja "\u3001"). */
  readonly time_split_separators: Readonly<Record<string, Strings>>;
  /**
   * Per language, the characters between an hour and its minutes ("9:30", "9.30"), for the
   * hours the code builds around the time formats: bare range starts and split-hour ends.
   */
  readonly time_minute_separators: Readonly<Record<string, Strings>>;
  /** Per language, a word after a number that multiplies it (ja "\u4e07": 10000), a power of ten. */
  readonly number_multipliers: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * Per language, words after which a multiplier alone is no amount: kanji numerals and vague
   * counts ("\u4e8c\u4e07\u5186", "\u6570\u4e07\u5186" are not read as 10,000).
   */
  readonly number_multiplier_blockers: Readonly<Record<string, Strings>>;
  /** Per language, what 12 o'clock with am or pm may mean (none: 12 AM 00:00, 12 PM 12:00). */
  readonly twelve_oclock: Readonly<Record<string, TwelveOClock>>;
  /** Per language, words that name a clock time ("midnight" -> "00:00"); always candidates. */
  readonly time_words: Readonly<Record<string, Table>>;
  readonly merge_tag_patterns: Strings;
  readonly promo_code_pattern: string;
  readonly artifact_patterns: Strings;
  readonly artifact_phrases: Strings;
  readonly currencies: Table;
  readonly calendar: Calendar;
  /** Per language, the words or signs between the days of a range ("27-30", "27. bis 30."). */
  readonly date_range_connectors: Readonly<Record<string, Strings>>;
  readonly formality_markers: Readonly<Record<string, Lexicon>>;
  readonly glossary: Glossary;
  readonly accepted_loanwords: Readonly<Record<string, Strings>>;
  readonly language_check: { readonly min_letters: number };
  /** The master length, in characters, from which length_ratio applies (short CTAs grow). */
  readonly length_ratio_min_chars: number;
}
