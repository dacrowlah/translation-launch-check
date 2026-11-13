import { describe, expect, it } from "vitest";
import { checkLength } from "../../../src/domain/checks/length";
import { checkLengthRatio } from "../../../src/domain/checks/length-ratio";
import { checkTemplateLeftovers } from "../../../src/domain/checks/template-leftovers";
import { aPair, ctx } from "../../support/builders";

const ADS = { channel: "google_ads", field: "headline" };

describe("length checks", () => {
  it("over_hard_limit_is_a_blocker", () => {
    const r = checkLength(aPair("30% off jackets", "x".repeat(31), "de-DE", ADS), ctx());
    expect(r.length_hard?.findings[0]).toMatchObject({
      severity: "blocker",
      expected: "30",
      found: "31",
    });
    expect(r.length_soft?.applicable).toBe(false);
  });
  it("soft_channel_over_limit_is_a_length_soft_warning", () => {
    const pair = aPair("Sale", "x".repeat(41), "de-DE", { channel: "email", field: "subject" });
    const r = checkLength(pair, ctx());
    expect(r.length_soft?.findings[0]).toMatchObject({ severity: "warning", found: "41" });
    expect(r.length_hard?.applicable).toBe(false);
  });
  it("within_limit_is_applicable_without_findings", () => {
    const r = checkLength(aPair("Sale", "x".repeat(30), "de-DE", ADS), ctx());
    expect(r.length_hard).toEqual({ applicable: true, findings: [] });
  });
  it.each([
    ["no limit", { channel: "email", field: "body" }],
    ["unknown channel", { channel: "fax", field: "body" }],
  ])("not_applicable_for_%s", (_name, line) => {
    const r = checkLength(aPair("Sale", "x".repeat(5000), "de-DE", line), ctx());
    expect([r.length_hard?.applicable, r.length_soft?.applicable]).toEqual([false, false]);
  });
});

describe("leftovers and length ratio", () => {
  it("leaked_prompt_text_is_a_blocker", () => {
    expect(
      checkTemplateLeftovers(
        aPair("Shop now", "Jetzt kaufen (mindestens eines erforderlich)"),
        ctx(),
      ).findings[0]?.severity,
    ).toBe("blocker");
  });
  it("clean_text_has_no_leftovers", () => {
    expect(checkTemplateLeftovers(aPair("Shop now", "Jetzt kaufen"), ctx()).findings).toEqual([]);
  });
  it("flags_a_translation_over_the_ratio", () => {
    const r = checkLengthRatio(aPair("a".repeat(100), "b".repeat(136)), ctx());
    expect(r.findings[0]).toMatchObject({ severity: "info", expected: "135", found: "136" });
  });
  it("accepts_a_translation_at_the_ratio", () => {
    expect(checkLengthRatio(aPair("a".repeat(100), "b".repeat(135)), ctx())).toEqual({
      applicable: true,
      findings: [],
    });
  });
  it("not_applicable_without_a_ratio_or_master", () => {
    expect(checkLengthRatio(aPair("Sale", "Soldes", "ja-JP"), ctx("ja-JP")).applicable).toBe(false);
    expect(checkLengthRatio(aPair("", "Soldes"), ctx()).applicable).toBe(false);
  });
});
