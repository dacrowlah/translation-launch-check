import { listCheck } from "./compare";

export const MERGE_TAGS_DETAIL = "A merge tag is missing, renamed or extra.";

export const checkMergeTags = listCheck({ check: "merge_tags", detail: MERGE_TAGS_DETAIL }, (p) => [
  p.master.mergeTags,
  p.target.mergeTags,
]);
