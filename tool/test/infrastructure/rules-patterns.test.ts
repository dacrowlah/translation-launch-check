import { describe, expect, it } from "vitest";
import { parseRules } from "../../src/infrastructure/rules-schema.js";
import { rawRules } from "../support/rules.js";

const section = (key: string): Record<string, unknown> =>
  rawRules()[key] as Record<string, unknown>;
const withCalendar = (key: string, part: object) => ({
  ...rawRules(),
  calendar: { ...section("calendar"), [key]: { ...(section("calendar")[key] as object), ...part } },
});
const withTable = (key: string, part: object) => ({
  ...rawRules(),
  [key]: { ...section(key), ...part },
});
const enFormats = (): unknown[] => section("time_formats")["en"] as unknown[];
const jaFormats = (): unknown[] => section("time_formats")["ja"] as unknown[];

describe("every locale's patterns compile when the rules load", () => {
  it.each([
    [
      "date_form_with_a_range_place",
      withCalendar("date_forms", { de: ["{first}\\.\\s*{month}"] }),
      /de-DE/,
    ],
    [
      "date_form_with_a_place_twice",
      withCalendar("date_forms", { de: ["{day}\\.{day}\\.\\s*{month}"] }),
      /de-DE/,
    ],
    [
      "date_form_with_an_unknown_place",
      withCalendar("date_forms", { en: ["{weekday} {day}"] }),
      /en-US/,
    ],
    ["weekday_form_with_a_day", withCalendar("weekday_after", { ja: ["[(]{day}[)]"] }), /ja-JP/],
    [
      "start_prefix_with_a_start_group",
      withTable("time_start_prefixes", { ja: "(?<h0>x)?" }),
      /ja-JP/,
    ],
    [
      "time_format_with_an_own_group",
      withTable("time_formats", { en: [...enFormats(), "(?<x>\\d)o"] }),
      /en-GB/,
    ],
    [
      "time_format_with_a_word_group",
      withTable("time_formats", { ja: [...jaFormats(), "(?<w>\\d)x"] }),
      /ja-JP/,
    ],
    ["percent_word_with_a_number_group", withTable("percent_words", { de: ["(?<sp>x)"] }), /de-CH/],
  ])("rejects_rules_whose_composed_patterns_do_not_compile_%#", (_name, rules, locale) => {
    expect(() => parseRules(rules)).toThrow(locale);
  });

  it("names_the_locale_whose_patterns_fail", () => {
    const bad = withTable("percent_words", { de: ["(?<sp>x)"] });
    expect(() => parseRules(bad)).toThrow(/patterns of de-DE do not compile/);
  });
});
