import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { localizationSchema } from "../../src/presentation/schemas";
import { testRules } from "../support/rules";

const LINE = { id: "L", channel: "email", field: "body" };
const pkg = (locales: string[], texts: Record<string, string>) => ({
  ...{ campaign: "c", master_locale: "en-US", locales },
  lines: [{ ...LINE, texts }],
});
const pathsOf = (error: z.ZodError): string[] => error.issues.map((i) => i.path.join("."));
const paths = (input: unknown): string[] => {
  const result = localizationSchema(testRules().limits).safeParse(input);
  return result.success ? [] : pathsOf(result.error);
};
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
});
