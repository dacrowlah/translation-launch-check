import { mergeTagName } from "../tokens/merge-tags";
import { listCheck } from "./compare";

export const MERGE_TAGS_DETAIL = "A merge tag is missing, renamed or extra.";

/** Tags compare by name; a changed Liquid default is copy for the language review. */
export const checkMergeTags = listCheck(
  { check: "merge_tags", detail: MERGE_TAGS_DETAIL },
  (p) => [p.master.mergeTags, p.target.mergeTags],
  mergeTagName,
);
