import { describe, expect, it } from "vitest";
import { checkLength } from "../../../src/domain/checks/length";
import { checkLengthRatio } from "../../../src/domain/checks/length-ratio";
import { checkMergeTags } from "../../../src/domain/checks/merge-tags";
import { checkTemplateLeftovers } from "../../../src/domain/checks/template-leftovers";
import type { LocaleContext } from "../../../src/domain/checks/compare";
import { aPair, ctx } from "../../support/builders";
import { rows } from "../../support/rows";
import { testRules } from "../../support/rules";

const ADS = { channel: "google_ads", field: "headline" };
const NONE = { applicable: false, findings: [] };
const HEADLINE_31 = {
  check: "length_hard",
  severity: "blocker",
  detail: "The text is longer than the channel allows (characters; double-width ones count 2).",
  expected: "30",
  found: "31",
};
const PROMPT_LEFT = {
  check: "template_leftovers",
  severity: "blocker",
  detail: "Placeholder or prompt text was left in the copy.",
  expected: null,
  found: "(mindestens eines erforderlich)",
};
const RATIO_136 = {
  check: "length_ratio",
  severity: "info",
  detail: "The translation is much longer than the master.",
  expected: "135",
  found: "136",
};
const SUBJECT_41 = {
  check: "length_soft",
  severity: "warning",
  detail: "The text is longer than the recommended length (characters).",
  expected: "40",
  found: "41",
};

describe("length checks", () => {
  it("over_hard_limit_is_only_a_length_hard_blocker", () => {
    const r = checkLength(aPair("30% off jackets", "x".repeat(31), "de-DE", ADS), ctx());
    expect(r).toEqual({
      length_hard: { applicable: true, findings: [HEADLINE_31] },
      length_soft: NONE,
    });
  });
  it("soft_channel_over_limit_is_only_a_length_soft_warning", () => {
    const pair = aPair("Sale", "x".repeat(41), "de-DE", { channel: "email", field: "subject" });
    expect(checkLength(pair, ctx())).toEqual({
      length_hard: NONE,
      length_soft: { applicable: true, findings: [SUBJECT_41] },
    });
  });
  it("an_sms_over_its_segment_limit_says_sms_segments", () => {
    const pair = aPair("Hi", "a".repeat(161), "de-DE", { channel: "sms", field: "body" });
    expect(checkLength(pair, ctx()).length_hard?.findings).toEqual([
      {
        check: "length_hard",
        severity: "blocker",
        detail: "The text is longer than the channel allows (SMS segments).",
        expected: "1",
        found: "2",
      },
    ]);
  });
  it("within_limit_is_applicable_without_findings", () => {
    const r = checkLength(aPair("Sale", "x".repeat(30), "de-DE", ADS), ctx());
    expect(r).toEqual({ length_hard: { applicable: true, findings: [] }, length_soft: NONE });
  });
  it.each([
    ["no limit", { channel: "email", field: "body" }],
    ["unknown channel", { channel: "fax", field: "body" }],
  ])("not_applicable_for_%s", (_name, line) => {
    const r = checkLength(aPair("Sale", "x".repeat(5000), "de-DE", line), ctx());
    expect(r).toEqual({ length_hard: NONE, length_soft: NONE });
  });
});

describe("template leftovers", () => {
  it("leaked_prompt_text_is_a_blocker", () => {
    const pair = aPair("Shop now", "Jetzt kaufen (mindestens eines erforderlich)");
    expect(checkTemplateLeftovers(pair, ctx())).toEqual({
      applicable: true,
      findings: [PROMPT_LEFT],
    });
  });
  it.each([
    ["Bonjour {0} !", "{0}"],
    ["Hallo [NAME]! Neuheiten f\u00fcr Sie", "[NAME]"],
    ["Hallo [First Name], willkommen", "[First Name]"],
    ["Hallo [Name]", "[Name]"],
    ["Hallo [FIRST_NAME], Neuheiten", "[FIRST_NAME]"],
    ["Sehr geehrte/r [last_name]", "[last_name]"],
    ["Hallo [FIRSTNAME], willkommen", "[FIRSTNAME]"],
    ["Sehr geehrte/r [LAST NAME]", "[LAST NAME]"],
    ["Ihre Adresse: [email]", "[email]"],
    ["Angebot f\u00fcr [COMPANY]", "[COMPANY]"],
  ])("an_unfilled_placeholder_is_a_leftover_%#", (target, placeholder) => {
    const r = checkTemplateLeftovers(aPair("Hello there, welcome", target), ctx());
    expect(rows(r)).toEqual([[null, placeholder]]);
  });
  it.each(["[SALE] 30% off", "[NEW] Winterjacken", "Hallo {{0}}, willkommen"])(
    "a_subject_prefix_or_a_merge_tag_is_no_placeholder_%#",
    (target) => {
      const r = checkTemplateLeftovers(aPair("[SALE] 30% off everything", target), ctx());
      expect(r).toEqual({ applicable: true, findings: [] });
    },
  );
  it("a_placeholder_is_a_leftover", () => {
    const r = checkTemplateLeftovers(aPair("Shop now", "Jetzt [[file]] kaufen"), ctx());
    expect(rows(r)).toEqual([[null, "[[file]]"]]);
  });
  it("a_placeholder_inside_a_leftover_is_one_row", () => {
    const r = checkTemplateLeftovers(aPair("Hi {{first_name}}", "Hallo [[first_name]]"), ctx());
    expect(rows(r)).toEqual([[null, "[[first_name]]"]]);
  });
  it("clean_text_has_no_leftovers", () => {
    expect(checkTemplateLeftovers(aPair("Shop now", "Jetzt kaufen"), ctx()).findings).toEqual([]);
  });
  it("a_renamed_merge_tag_is_a_merge_tag_finding_only", () => {
    const pair = aPair("Hi {{first_name}}", "Hallo {{vorname}}");
    expect(rows(checkMergeTags(pair, ctx()))).toEqual([["{{first_name}}", "{{vorname}}"]]);
    expect(checkTemplateLeftovers(pair, ctx()).findings).toEqual([]);
  });
});

/** de-DE allows 1.35 times the master's length, from a master of 20 characters. */
const withMinimum = (chars: number): LocaleContext => ({
  ...ctx(),
  rules: { ...testRules(), length_ratio_min_chars: chars },
});

describe("length ratio", () => {
  it("flags_a_translation_over_the_ratio", () => {
    const r = checkLengthRatio(aPair("a".repeat(100), "b".repeat(136)), ctx());
    expect(r).toEqual({ applicable: true, findings: [RATIO_136] });
  });
  it("flags_a_forty_character_master_against_sixty", () => {
    expect(rows(checkLengthRatio(aPair("a".repeat(40), "b".repeat(60)), ctx()))).toEqual([
      ["54", "60"],
    ]);
  });
  it("accepts_a_translation_at_the_ratio", () => {
    const r = checkLengthRatio(aPair("a".repeat(20), "b".repeat(27)), ctx());
    expect(r).toEqual({ applicable: true, findings: [] });
  });
  it.each([
    ["a short master", "Shop now", "Jetzt shoppen", "de-DE"],
    ["a master under the minimum", "a".repeat(19), "b".repeat(40), "de-DE"],
    ["an empty master", "", "Hallo", "de-DE"],
    ["a locale without a ratio", "a".repeat(40), "b".repeat(80), "ja-JP"],
  ])("not_applicable_for_%s", (_name, master, target, locale) => {
    expect(checkLengthRatio(aPair(master, target, locale), ctx(locale))).toEqual(NONE);
  });
  it("reads_the_minimum_master_length_from_the_rules", () => {
    const r = checkLengthRatio(aPair("Shop now", "Jetzt shoppen"), withMinimum(5));
    expect(rows(r)).toEqual([["10", "13"]]);
  });
});
