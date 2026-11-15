import { fitItem, type CopyFitItem, type CopyFitResult } from "../domain/copy-fit.js";
import type { Rules } from "../domain/rules.js";

export const checkCopyFit = (items: readonly CopyFitItem[], rules: Rules): CopyFitResult[] =>
  items.map((item) => fitItem(item, rules));
