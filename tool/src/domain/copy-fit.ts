import { findArtifacts } from "./artifacts";
import type { ChannelRule, Rules } from "./rules";
import { smsEncoding, smsSegments, type SmsEncoding } from "./sms";
import type { LengthInfo, PackageLine, Severity, Unit } from "./types";

export { findArtifacts } from "./artifacts";
export { smsEncoding } from "./sms";

const WIDE =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;

const adsChars = (text: string): number =>
  [...text].reduce((sum, ch) => sum + (WIDE.test(ch) ? 2 : 1), 0);

export const measure = (text: string, unit: Unit): number => {
  if (unit === "ads_chars") return adsChars(text);
  return unit === "sms_segments" ? smsSegments(text) : [...text].length;
};

export const channelRule = (rules: Rules, channel: string, field: string): ChannelRule | null =>
  rules.channels.find((c) => c.channel === channel && c.field === field) ?? null;

export const lengthInfo = (line: PackageLine, text: string, rules: Rules): LengthInfo | null => {
  const rule = channelRule(rules, line.channel, line.field);
  return rule && { value: measure(text, rule.unit), limit: rule.limit, unit: rule.unit };
};

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

const severityOf = (artifacts: number, fits: boolean | null): Severity | null => {
  if (artifacts > 0) return "blocker";
  return fits === true ? null : "warning";
};

const FALLBACK = (text: string): LengthInfo => ({
  value: measure(text, "chars"),
  limit: null,
  unit: "chars",
});

const overBy = (info: LengthInfo, fits: boolean | null): number | null =>
  fits === null ? null : Math.max(0, info.value - (info.limit ?? info.value));

const fitsOf = (info: LengthInfo | null): boolean | null =>
  info && (info.limit === null || info.value <= info.limit);

const lengthFields = (info: LengthInfo, fits: boolean | null) => ({
  ...{ length: info.value, limit: info.limit, unit: info.unit },
  ...{ fits, over_by: overBy(info, fits) },
});

const describe = (item: CopyFitItem, info: LengthInfo, fits: boolean | null) => ({
  channel: item.channel,
  field: item.field,
  ...lengthFields(info, fits),
  encoding: info.unit === "sms_segments" ? smsEncoding(item.text) : null,
});

export const fitItem = (item: CopyFitItem, rules: Rules): CopyFitResult => {
  const known = lengthInfo({ id: "", ...item, texts: {} }, item.text, rules);
  const fits = fitsOf(known);
  const artifacts = findArtifacts(item.text, item.master ?? null, rules);
  const base = describe(item, known ?? FALLBACK(item.text), fits);
  return { ...base, template_artifacts: artifacts, severity: severityOf(artifacts.length, fits) };
};
