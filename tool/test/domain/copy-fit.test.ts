import { describe, expect, it } from "vitest";
import { fitItem, findArtifacts, lengthInfo, measure } from "../../src/domain/copy-fit";
import { aLine } from "../support/builders";
import { testRules } from "../support/rules";

describe("measuring copy", () => {
  it("counts_cjk_double_for_ads", () => {
    expect(measure("春のセール", "ads_chars")).toBe(10);
    expect(measure("春のセール", "chars")).toBe(5);
  });
  it.each([
    ["a".repeat(160), 1],
    ["a".repeat(161), 2],
    ["ç" + "a".repeat(69), 1],
    ["一".repeat(71), 2],
    ["[".repeat(81), 2],
  ])("counts_sms_segments", (text, segments) => {
    expect(measure(text, "sms_segments")).toBe(segments);
  });
  it("japanese_headline_28_of_30_passes_and_reports_length", () => {
    expect(
      lengthInfo(aLine({ channel: "google_ads", field: "headline" }), "ジ".repeat(14), testRules()),
    ).toEqual({ value: 28, limit: 30, unit: "ads_chars" });
  });
});

describe("template artifacts", () => {
  it("merge_tag_from_master_is_not_an_artifact", () => {
    expect(findArtifacts("Hallo {{first_name}}", "Hi {{first_name}}", testRules())).toEqual([]);
    expect(findArtifacts("Hallo {{vorname}} [[cta]]", "Hi {{first_name}}", testRules())).toEqual([
      "{{vorname}}",
      "[[cta]]",
    ]);
  });
  it("without_master_a_merge_tag_is_not_an_artifact", () => {
    expect(findArtifacts("Hallo {{vorname}}", null, testRules())).toEqual([]);
  });
  it("finds_phrases_ignoring_case", () => {
    expect(findArtifacts("HERE IS THE TRANSLATION: hi", null, testRules())).toEqual([
      "HERE IS THE TRANSLATION",
    ]);
  });
});

describe("fitItem", () => {
  it("soft_channel_over_limit_is_warning_in_copy_fit", () => {
    expect(
      fitItem({ channel: "email", field: "subject", text: "x".repeat(41) }, testRules()),
    ).toMatchObject({
      length: 41,
      limit: 40,
      fits: false,
      over_by: 1,
      severity: "warning",
    });
  });
  it("unknown_pair_has_no_limit_and_warns", () => {
    expect(fitItem({ channel: "fax", field: "body", text: "hi" }, testRules())).toMatchObject({
      length: 2,
      limit: null,
      fits: null,
      over_by: null,
      severity: "warning",
    });
  });
  it("artifact_is_a_blocker_and_sms_reports_encoding", () => {
    expect(
      fitItem({ channel: "sms", field: "body", text: "Hi [[cta]]" }, testRules()),
    ).toMatchObject({
      encoding: "GSM-7",
      template_artifacts: ["[[cta]]"],
      severity: "blocker",
    });
  });
  it("fitting_text_has_no_severity", () => {
    expect(fitItem({ channel: "email", field: "subject", text: "Hi" }, testRules())).toMatchObject({
      fits: true,
      over_by: 0,
      severity: null,
    });
  });
});
