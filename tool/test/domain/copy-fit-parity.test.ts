import { describe, expect, it } from "vitest";
import { checkLength } from "../../src/domain/checks/length.js";
import { fitItem } from "../../src/domain/copy-fit.js";
import type { ChannelRule } from "../../src/domain/rules.js";
import { aPair, ctx } from "../support/builders.js";
import { testRules } from "../support/rules.js";

const LIMITED = testRules()
  .channels.filter((rule) => rule.limit !== null)
  .map((rule) => [`${rule.channel}/${rule.field}`, rule] as const);

/** A text exactly at the channel's limit: one SMS segment is 160 GSM-7 characters. */
const atLimit = ({ unit, limit }: ChannelRule): string =>
  "x".repeat(unit === "sms_segments" ? 160 : (limit ?? 0));

/** The severities localization_check's length findings give a text, and copy fit's. */
const bothSeverities = ({ channel, field }: ChannelRule, text: string) => {
  const r = checkLength(aPair("Sale", text, "de-DE", { channel, field }), ctx());
  const found = [...(r.length_hard?.findings ?? []), ...(r.length_soft?.findings ?? [])];
  return [found.map((f) => f.severity), fitItem({ channel, field, text }, testRules()).severity];
};

describe("copy fit and localization_check agree", () => {
  it.each(LIMITED)("an_over_limit_text_has_one_severity_in_both_on_%s", (_name, rule) => {
    const [found, fit] = bothSeverities(rule, `${atLimit(rule)}x`.repeat(2));
    expect(found).toEqual([fit]);
  });
  it.each(LIMITED)("a_text_at_the_limit_fits_in_both_on_%s", (_name, rule) => {
    expect(bothSeverities(rule, atLimit(rule))).toEqual([[], null]);
  });
});
