import { copyFitArtifacts } from "./artifacts";
import type { ChannelRule, Rules } from "./rules";
import { smsEncoding, smsSegments, type SmsEncoding } from "./sms";
import type { LengthInfo, Severity, Unit } from "./types";

/** Double-width characters (Google Ads counts them 2): CJK, Hangul, full-width forms. */
const WIDE =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;

const adsChars = (text: string): number =>
  [...text].reduce((sum, ch) => sum + (WIDE.test(ch) ? 2 : 1), 0);

export const measure = (text: string, unit: Unit): number => {
  if (unit === "ads_chars") return adsChars(text);
  return unit === "sms_segments" ? smsSegments(text) : [...text].length;
};

export const channelRule = (rules: Rules, channel: string, field: string): ChannelRule | null =>
  rules.channels.find((c) => c.channel === channel && c.field === field) ?? null;

export const lengthInfo = (
  channel: string,
  field: string,
  text: string,
  rules: Rules,
): LengthInfo | null => {
  const rule = channelRule(rules, channel, field);
  return rule && { value: measure(text, rule.unit), limit: rule.limit, unit: rule.unit };
};

/** Whether a measured text is within its channel's limit (no limit: always). */
export const fitsLimit = (info: LengthInfo): boolean =>
  info.limit === null || info.value <= info.limit;

export type LengthCheck = "length_hard" | "length_soft";

/** The check a text over the channel's limit fails: a soft channel only warns. */
export const lengthCheckOf = (rule: ChannelRule): LengthCheck =>
  rule.soft ? "length_soft" : "length_hard";

export interface CopyFitItem {
  readonly channel: string;
  readonly field: string;
  readonly text: string;
  readonly master?: string;
}
export interface CopyFitResult {
  readonly channel: string;
  readonly field: string;
  readonly length: number;
  readonly limit: number | null;
  readonly unit: Unit;
  readonly fits: boolean | null;
  readonly over_by: number | null;
  readonly encoding: SmsEncoding | null;
  readonly template_artifacts: string[];
  readonly severity: Severity | null;
}

/** An item measured on its channel; an unknown pair is counted in chars, with no limit. */
interface Measured {
  readonly rule: ChannelRule | null;
  readonly info: LengthInfo;
  readonly fits: boolean | null;
}

const measured = ({ channel, field, text }: CopyFitItem, rules: Rules): Measured => {
  const info = lengthInfo(channel, field, text, rules);
  const fits = info && fitsLimit(info);
  const unknown: LengthInfo = { value: measure(text, "chars"), limit: null, unit: "chars" };
  return { rule: channelRule(rules, channel, field), info: info ?? unknown, fits };
};

/** The severities localization_check gives the same text (unknown pair: a warning). */
const severityOf = (rules: Rules, artifacts: number, { rule, fits }: Measured): Severity | null => {
  if (artifacts > 0) return rules.severities.template_leftovers;
  if (rule === null) return "warning";
  return fits === true ? null : rules.severities[lengthCheckOf(rule)];
};

const overBy = (info: LengthInfo, fits: boolean | null): number | null =>
  fits === null ? null : Math.max(0, info.value - (info.limit ?? info.value));

const counted = (info: LengthInfo) => ({ length: info.value, limit: info.limit, unit: info.unit });

const lengthFields = ({ info, fits }: Measured) => ({
  ...counted(info),
  fits,
  over_by: overBy(info, fits),
});

const itemFields = (item: CopyFitItem, m: Measured) => ({
  channel: item.channel,
  field: item.field,
  ...lengthFields(m),
  encoding: m.info.unit === "sms_segments" ? smsEncoding(item.text) : null,
});

export const fitItem = (item: CopyFitItem, rules: Rules): CopyFitResult => {
  const m = measured(item, rules);
  const template_artifacts = copyFitArtifacts(item.text, item.master ?? null, rules);
  const severity = severityOf(rules, template_artifacts.length, m);
  return { ...itemFields(item, m), template_artifacts, severity };
};
