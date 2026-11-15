import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Rules } from "../../src/domain/rules";
import { copyFitSchema, localizationSchema } from "../../src/presentation/schemas";
import { testRules } from "../support/rules";

const TARGETS = ["de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH", "it-IT"];
const EMOJI = "\u{1f600}";
const LINE = { id: "L", channel: "email", field: "body" };
const textsFor = (master: string, locales: string[], text = "b") =>
  Object.fromEntries([master, ...locales].map((locale) => [locale, text]));
const pkg = (locales: string[], texts: Record<string, string>, master = "en-US") => ({
  ...{ campaign: "c", master_locale: master, locales },
  lines: [{ ...LINE, texts }],
});
const aPkg = (over: Record<string, unknown> = {}) => ({
  ...pkg(["de-DE"], textsFor("en-US", ["de-DE"])),
  ...over,
});
const lines = (count: number, patch: Record<string, string> = {}) =>
  Array.from({ length: count }, () => ({ ...LINE, texts: textsFor("en-US", ["de-DE"]), ...patch }));
const items = (count: number, patch: Record<string, string> = {}) =>
  Array.from({ length: count }, () => ({ channel: "email", field: "body", text: "x", ...patch }));

const issuePaths = (error: z.ZodError): string[] => error.issues.map((i) => i.path.join("."));
const pathsOf = (result: z.ZodSafeParseResult<unknown>): string[] =>
  result.success ? [] : issuePaths(result.error);
const paths = (input: unknown, rules: Rules = testRules()): string[] =>
  pathsOf(localizationSchema(rules).safeParse(input));
const fitPaths = (input: unknown): string[] =>
  pathsOf(copyFitSchema(testRules().limits).safeParse(input));
const OK = { "en-US": "a", "de-DE": "b" };

describe("localizationSchema", () => {
  it("accepts_exactly_master_plus_targets", () => {
    expect(paths(pkg(["de-DE"], OK))).toEqual([]);
  });

  it("flags_duplicate_targets_at_locales", () => {
    expect(paths(pkg(["de-DE", "de-DE"], OK))).toContain("locales");
  });

  it("flags_the_master_as_a_target_at_locales", () => {
    expect(paths(pkg(["en-US"], { "en-US": "a" }))).toContain("locales");
  });

  it("flags_extra_texts_keys", () => {
    expect(paths(pkg(["de-DE"], { ...OK, "fr-FR": "c" }))).toEqual(["lines.0.texts"]);
  });

  it("flags_texts_keys_that_are_not_locales", () => {
    expect(paths(pkg(["de-DE"], { ...OK, x: "c" }))).toContain("lines.0.texts.x");
  });

  it("flags_missing_texts_keys", () => {
    expect(paths(pkg(["de-DE"], { "en-US": "a" }))).toEqual(["lines.0.texts"]);
  });

  it("flags_a_master_locale_other_than_the_rules_master", () => {
    expect(paths(pkg(["de-DE"], textsFor("en-GB", ["de-DE"]), "en-GB"))).toContain("master_locale");
  });

  it("takes_the_master_locale_from_the_rules", () => {
    const rules = { ...testRules(), master_locale: "en-GB" };
    const valid = pkg(["de-DE"], textsFor("en-GB", ["de-DE"]), "en-GB");
    const masterAsTarget = pkg(["en-GB"], textsFor("en-GB", []), "en-GB");
    expect([paths(valid, rules), paths(masterAsTarget, rules).includes("locales")]).toEqual([
      [],
      true,
    ]);
  });
});

// Each bound at its literal limit and one past it: [name, input of size n, limit, path].
const BOUNDS: [string, (n: number) => unknown, number, string][] = [
  [
    "locales",
    (n) => pkg(TARGETS.slice(0, n), textsFor("en-US", TARGETS.slice(0, n))),
    5,
    "locales",
  ],
  ["lines", (n) => aPkg({ lines: lines(n) }), 50, "lines"],
  ["id", (n) => aPkg({ lines: lines(1, { id: "i".repeat(n) }) }), 40, "lines.0.id"],
  ["channel", (n) => aPkg({ lines: lines(1, { channel: "c".repeat(n) }) }), 40, "lines.0.channel"],
  ["field", (n) => aPkg({ lines: lines(1, { field: "f".repeat(n) }) }), 40, "lines.0.field"],
  ["campaign", (n) => aPkg({ campaign: "c".repeat(n) }), 100, "campaign"],
  ["text", (n) => pkg(["de-DE"], { ...OK, "de-DE": "t".repeat(n) }), 1000, "lines.0.texts.de-DE"],
  [
    "text_in_code_points",
    (n) => pkg(["de-DE"], { ...OK, "de-DE": EMOJI.repeat(n) }),
    1000,
    "lines.0.texts.de-DE",
  ],
];
const FIT_BOUNDS: [string, (n: number) => unknown, number, string][] = [
  ["items", (n) => ({ items: items(n) }), 50, "items"],
  ["item_text", (n) => ({ items: items(1, { text: EMOJI.repeat(n) }) }), 1000, "items.0.text"],
  ["item_master", (n) => ({ items: items(1, { master: "m".repeat(n) }) }), 1000, "items.0.master"],
  ["item_channel", (n) => ({ items: items(1, { channel: "c".repeat(n) }) }), 40, "items.0.channel"],
];

describe("schema bounds", () => {
  it.each(BOUNDS)("accepts_%s_at_the_limit", (_name, build, limit) => {
    expect(paths(build(limit))).toEqual([]);
  });

  it.each(BOUNDS)("rejects_%s_one_past_the_limit", (_name, build, limit, path) => {
    expect(paths(build(limit + 1))).toEqual([path]);
  });

  it.each(FIT_BOUNDS)("copy_fit_accepts_%s_at_the_limit", (_name, build, limit) => {
    expect(fitPaths(build(limit))).toEqual([]);
  });

  it.each(FIT_BOUNDS)("copy_fit_rejects_%s_one_past_the_limit", (_name, build, limit, path) => {
    expect(fitPaths(build(limit + 1))).toEqual([path]);
  });
});
