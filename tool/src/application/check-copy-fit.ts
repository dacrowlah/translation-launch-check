import { fitItem, type CopyFitItem, type CopyFitResult } from "../domain/copy-fit";
import type { Rules } from "../domain/rules";

export const checkCopyFit = (items: readonly CopyFitItem[], rules: Rules): CopyFitResult[] =>
  items.map((item) => fitItem(item, rules));
