import type { LocaleRule, Rules } from "../rules";
import { resolvePair } from "../tokens/resolve-pair";
import { tokenize, type Tokens } from "../tokens/tokenize";
import type { LocaleContext } from "./compare";

type Tokenizer = (text: string, rule: LocaleRule, rules: Rules) => Tokens;

/** Both sides of a line tokenized (each in its own locale) and resolved against each other. */
export const resolvedSides = (
  masterText: string,
  targetText: string,
  ctx: LocaleContext,
  read: Tokenizer = tokenize,
): [master: Tokens, target: Tokens] =>
  resolvePair(read(masterText, ctx.masterRule, ctx.rules), read(targetText, ctx.rule, ctx.rules));
