import { describe, expect, it } from "vitest";
import { fitItem, lengthInfo, measure, type CopyFitResult } from "../../src/domain/copy-fit.js";
import type { Rules } from "../../src/domain/rules.js";
import { testRules } from "../support/rules.js";

const HEADLINE_31 = { channel: "google_ads", field: "headline", text: "x".repeat(31) };

/** A whole copy-fit result: an email subject that fits, with the fields a test changes. */
const FITTING_SUBJECT: CopyFitResult = {
  channel: "email",
  field: "subject",
  length: 2,
  limit: 40,
  unit: "chars",
  fits: true,
  over_by: 0,
  encoding: null,
  template_artifacts: [],
  severity: null,
};
const aFit = (fields: Partial<CopyFitResult>): CopyFitResult => ({ ...FITTING_SUBJECT, ...fields });

const HEADLINE_31_FIT = aFit({
  channel: "google_ads",
  field: "headline",
  length: 31,
  limit: 30,
  unit: "ads_chars",
  fits: false,
  over_by: 1,
  severity: "blocker",
});
const SMS_FIT = aFit({
  channel: "sms",
  field: "body",
  length: 1,
  limit: 1,
  unit: "sms_segments",
  encoding: "GSM-7",
  template_artifacts: ["[[cta]]"],
  severity: "blocker",
});

const withSeverity = (fields: Partial<Rules["severities"]>): Rules => {
  const base = testRules();
  return { ...base, severities: { ...base.severities, ...fields } };
};

describe("measuring copy", () => {
  it("counts_cjk_double_for_ads", () => {
    expect(measure("\u6625\u306e\u30bb\u30fc\u30eb", "ads_chars")).toBe(10);
    expect(measure("\u6625\u306e\u30bb\u30fc\u30eb", "chars")).toBe(5);
  });
  it("counts_a_cjk_extension_b_character_double_for_ads", () => {
    const text =
      "\u{20bb7}\u91ce\u5bb6\u3067\u4eca\u3059\u3050\u8cb7\u3046" + "\u{20bb7}".repeat(11);
    expect(measure(text, "ads_chars")).toBe(40);
  });
  it("counts_a_full_width_letter_double_for_ads", () => {
    expect(measure("\uff21", "ads_chars")).toBe(2);
  });
  it("counts_a_half_width_katakana_once_for_ads", () => {
    expect(measure("\uff73\uff68\uff9d\uff80\uff70\uff7e\uff70\uff99", "ads_chars")).toBe(8);
  });
  it.each([
    ["a".repeat(160), 1],
    ["a".repeat(161), 2],
    ["a".repeat(306), 2],
    ["a".repeat(307), 3],
    ["\u00e7" + "a".repeat(69), 1],
    ["\u4e00".repeat(71), 2],
    ["\u4e00".repeat(134), 2],
    ["\u4e00".repeat(135), 3],
    ["[".repeat(81), 2],
    ["\u2013" + "a".repeat(67) + "\u{1f389}", 1],
    ["\u2013" + "a".repeat(68) + "\u{1f389}", 2],
  ])("counts_sms_segments_%#", (text, segments) => {
    expect(measure(text, "sms_segments")).toBe(segments);
  });
  it("japanese_headline_28_of_30_passes_and_reports_length", () => {
    expect(lengthInfo("google_ads", "headline", "\u30b8".repeat(14), testRules())).toEqual({
      value: 28,
      limit: 30,
      unit: "ads_chars",
    });
  });
});

describe("fitItem", () => {
  it("hard_channel_over_limit_is_the_length_hard_severity", () => {
    expect(fitItem(HEADLINE_31, testRules())).toEqual(HEADLINE_31_FIT);
  });
  it("reads_the_hard_limit_severity_from_the_rules", () => {
    expect(fitItem(HEADLINE_31, withSeverity({ length_hard: "warning" })).severity).toBe("warning");
  });
  it("soft_channel_over_limit_is_warning_in_copy_fit", () => {
    const item = { channel: "email", field: "subject", text: "x".repeat(41) };
    expect(fitItem(item, testRules())).toEqual(
      aFit({ length: 41, fits: false, over_by: 1, severity: "warning" }),
    );
  });
  it("unknown_pair_has_no_limit_and_warns", () => {
    expect(fitItem({ channel: "fax", field: "body", text: "hi" }, testRules())).toEqual(
      aFit({
        channel: "fax",
        field: "body",
        limit: null,
        fits: null,
        over_by: null,
        severity: "warning",
      }),
    );
  });
  it("artifact_is_a_blocker_and_sms_reports_encoding", () => {
    const item = { channel: "sms", field: "body", text: "Hi [[cta]]" };
    expect(fitItem(item, testRules())).toEqual(SMS_FIT);
  });
  it("artifact_is_a_blocker_even_on_a_soft_channel", () => {
    const item = { channel: "email", field: "subject", text: "Shop now [[file]]" };
    expect(fitItem(item, testRules()).severity).toBe("blocker");
  });
  it("reads_the_artifact_severity_from_the_rules", () => {
    const item = { channel: "email", field: "subject", text: "Shop now [[file]]" };
    expect(fitItem(item, withSeverity({ template_leftovers: "warning" })).severity).toBe("warning");
  });
  it("fitting_text_has_no_severity", () => {
    expect(fitItem({ channel: "email", field: "subject", text: "Hi" }, testRules())).toEqual(
      aFit({}),
    );
  });
});
