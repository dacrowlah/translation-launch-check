import { findArtifacts } from "../artifacts.js";
import { resultOf, type LineCheck, type Row, type Spec } from "./compare.js";

export const TEMPLATE_LEFTOVERS_DETAIL = "Placeholder or prompt text was left in the copy.";

const SPEC: Spec = { check: "template_leftovers", detail: TEMPLATE_LEFTOVERS_DETAIL };

const rowOf = (artifact: string): Row => [undefined, artifact];

/** Merge tags are the merge_tags check's: a renamed tag is one finding, not two. */
export const checkTemplateLeftovers: LineCheck = (pair, ctx) => {
  const found = findArtifacts(pair.targetText, ctx.rules);
  return resultOf(ctx.rules, SPEC, true, found.map(rowOf));
};
