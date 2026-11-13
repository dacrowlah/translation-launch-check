import { findArtifacts } from "../copy-fit";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare";

export const TEMPLATE_LEFTOVERS_DETAIL = "Placeholder or prompt text was left in the copy.";

const SPEC: Spec = { check: "template_leftovers", detail: TEMPLATE_LEFTOVERS_DETAIL };

const rowOf = (artifact: string): Row => [undefined, artifact];

export const checkTemplateLeftovers: LineCheck = (pair, ctx) => {
  const found = findArtifacts(pair.targetText, pair.masterText, ctx.rules);
  return resultOf(ctx.rules, SPEC, true, found.map(rowOf));
};
