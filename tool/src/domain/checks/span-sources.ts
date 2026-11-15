import { REFERENCE } from "../tokens/references.js";
import { URL_PATH, URL_SOURCE } from "../tokens/link-patterns.js";
import { anyCase } from "../tokens/regex.js";

const block = (name: string): string =>
  String.raw`<${anyCase(name)}\b[^>]*>[\s\S]*?<\/${anyCase(name)}\s*>`;

const QUOTED = String.raw`"[^"]*"|'[^']*'`;
/** A comment; style and script blocks with their bodies; a tag (a ">" in quotes is no end). */
const ELEMENT = String.raw`<\/?[A-Za-z!](?:${QUOTED}|[^<>"'])*>`;
const TAG = String.raw`<!--[\s\S]*?-->|${block("style")}|${block("script")}|${ELEMENT}`;

/** A top-level domain is all lower or all upper case ("shop.de", "SHOP.COM"). */
const TLD = String.raw`(?:[a-z]{2,}|[A-Z]{2,})(?![\p{Script=Latin}\p{N}])`;
const LOCAL = String.raw`[\p{Script=Latin}\p{N}._%+-]`;
const LABEL = String.raw`[\p{Script=Latin}\p{N}-]`;
const EMAIL = String.raw`(?<!${LOCAL})${LOCAL}+@${LABEL}+(?:\.${LABEL}+)*\.${TLD}`;

/**
 * "example.com/colors" or "shop.example.com": never "jetzt.nur" (a missing space) or
 * "z.B.bei" (one-letter labels without a path), and never the "." that ends a sentence.
 */
const NAME = String.raw`[A-Za-z0-9-]+\.`;
const LONG_NAME = String.raw`[A-Za-z0-9-]{2,}\.`;
const LEAD = String.raw`(?<![\p{L}\p{N}@./-])`;
const WITH_PATH = String.raw`(?:${NAME})+${TLD}\/(?:${URL_PATH})?`;
const DOMAIN = String.raw`${LEAD}(?:${WITH_PATH}|(?:${LONG_NAME}){2,}${TLD})`;

/** Markup first, so a link or email inside an attribute is part of its tag. */
export const MARKUP = [TAG, REFERENCE];
export const LINKS = [URL_SOURCE, EMAIL, DOMAIN];
/** Tags and references are word breaks; text may touch any other span ("{{name}}s"). */
export const BREAK = new RegExp(`^(?:${MARKUP.join("|")})$`, "u");
