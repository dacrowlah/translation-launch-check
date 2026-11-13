import type { ChannelRule, Rules } from "../rules";
import type { LengthInfo } from "../types";
import { channelRule, lengthInfo } from "../copy-fit";
import { resultOf, type LinePair, type MultiCheck, type Row, type Spec } from "./compare";

export const LENGTH_HARD_DETAIL = "The text is longer than the channel allows.";
export const LENGTH_SOFT_DETAIL = "The text is longer than the recommended length.";

const HARD: Spec = { check: "length_hard", detail: LENGTH_HARD_DETAIL };
const SOFT: Spec = { check: "length_soft", detail: LENGTH_SOFT_DETAIL };

const overRows = (info: LengthInfo | null): Row[] =>
  info?.limit != null && info.value > info.limit ? [[String(info.limit), String(info.value)]] : [];

const countedRule = (pair: LinePair, rules: Rules): ChannelRule | null => {
  const rule = channelRule(rules, pair.line.channel, pair.line.field);
  return rule?.limit == null ? null : rule;
};

export const checkLength: MultiCheck = (pair, ctx) => {
  const soft = countedRule(pair, ctx.rules)?.soft;
  const rows = overRows(lengthInfo(pair.line, pair.targetText, ctx.rules));
  return {
    length_hard: resultOf(ctx.rules, HARD, soft === false, rows),
    length_soft: resultOf(ctx.rules, SOFT, soft === true, rows),
  };
};
