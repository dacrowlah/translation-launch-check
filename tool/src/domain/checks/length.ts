import {
  channelRule,
  fitsLimit,
  lengthCheckOf,
  lengthInfo,
  type LengthCheck,
} from "../copy-fit.js";
import type { Rules } from "../rules.js";
import type { CheckResult, LengthInfo, PackageLine, Unit } from "../types.js";
import { resultOf, type MultiCheck, type Row } from "./compare.js";

const OVER: Readonly<Record<LengthCheck, string>> = {
  length_hard: "The text is longer than the channel allows",
  length_soft: "The text is longer than the recommended length",
};
const UNIT_NAMES: Readonly<Record<Unit, string>> = {
  chars: "characters",
  ads_chars: "characters; double-width ones count 2",
  sms_segments: "SMS segments",
};

/** One fixed detail per check and unit: "The text is longer than the channel allows (SMS segments)." */
export const lengthDetail = (check: LengthCheck, unit: Unit): string =>
  `${OVER[check]} (${UNIT_NAMES[unit]}).`;

const overRows = (info: LengthInfo | null): Row[] =>
  info === null || fitsLimit(info) ? [] : [[String(info.limit), String(info.value)]];

/** `applies`: the one length check the channel's limit belongs to, or null without a limit. */
const resultFor = (
  check: LengthCheck,
  info: LengthInfo | null,
  applies: LengthCheck | null,
  rules: Rules,
): CheckResult => {
  const spec = { check, detail: lengthDetail(check, info?.unit ?? "chars") };
  return resultOf(rules, spec, applies === check, overRows(info));
};

/** The length check a line's channel limit belongs to; null for no limit or an unknown pair. */
const appliesTo = ({ channel, field }: PackageLine, rules: Rules): LengthCheck | null => {
  const rule = channelRule(rules, channel, field);
  return rule?.limit == null ? null : lengthCheckOf(rule);
};

export const checkLength: MultiCheck = ({ line, targetText }, ctx) => {
  const info = lengthInfo(line.channel, line.field, targetText, ctx.rules);
  const applies = appliesTo(line, ctx.rules);
  return {
    length_hard: resultFor("length_hard", info, applies, ctx.rules),
    length_soft: resultFor("length_soft", info, applies, ctx.rules),
  };
};
