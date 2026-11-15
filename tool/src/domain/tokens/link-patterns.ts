import { REFERENCE } from "./references";
import { anyCase } from "./regex";

/** An encoded ampersand ("&amp;", "&#38;", "&#038;", "&#x26;") is part of a link's query. */
export const ENCODED_AMPERSAND = "&(?:amp|#0*38|#[xX]0*26);";

/** A character reference other than an encoded ampersand ends a link ("&nbsp;"). */
const guarded = (char: string): string =>
  String.raw`(?!(?!${ENCODED_AMPERSAND})${REFERENCE})(?:${char})`;

const IN_WORD_APOSTROPHE = String.raw`'(?=[\p{L}\p{N}])`;
const LATIN_LETTER = String.raw`[\p{Script=Latin}\p{M}]`;
/** Kanji, or a katakana letter with the long-vowel mark (shared with hiragana): "\u30bb\u30fc". */
const CJK = String.raw`(?:\p{Script=Han}|(?=\p{L})\p{Script_Extensions=Katakana})`;

const LETTERS = [IN_WORD_APOSTROPHE, LATIN_LETTER, CJK];
/**
 * A dash inside a path, when the dashed word holds a letter and runs on to "/", "?" or "#"
 * and then a letter, digit or "%" ("sale\u2013deals?utm"; never "\u201424/7", "\u2014answers?
 * Yes", "\u2013today?!" or "\u2013shop/.").
 * The lookahead is linear: digits, one letter, then letters or digits.
 */
const PATH_DASH = String.raw`\p{Pd}(?=[0-9]*[A-Za-z][A-Za-z0-9]*[/?#][A-Za-z0-9%])`;
/** The host: a path letter but no "/" and no dash ("example.com\u2014our" ends at the dash). */
const HOST_LETTER = [String.raw`[!$-&(-.0-;=@-~]`, ...LETTERS];

/**
 * One character of a link's path in running text: printable ASCII except quotes, angle
 * brackets, "?" and "#" (so digits, URL punctuation, %-escapes and the ASCII hyphen), an
 * apostrophe inside a word, a Latin letter ("k\u00fcche"), katakana or kanji ("\u5927\u962a"),
 * and a dash before a word that runs on to a link character. Never hiragana ("\u3092"), CJK
 * punctuation, a space, or another en or em dash ("sale\u2014today"): those end the link.
 */
const PATH_LETTER = [String.raw`[!$-&(-;=@-~]`, ...LETTERS, PATH_DASH];

/**
 * After "?" or "#": the same letters but no dash, with "?" and "#". A query value continues
 * through katakana and kanji ("q=\u30bb\u30fc\u30eb") and may start with hiragana
 * ("kw=\u304a\u305b\u3061"), so a changed Japanese value is caught; copy glued to a value with
 * no space joins it.
 */
const QUERY_LETTER = [String.raw`=\p{Script=Hiragana}+`, String.raw`[!#-&(-;=?-~]`, ...LETTERS];

const anyGuarded = (letters: readonly string[]): string => guarded(letters.join("|"));

/** Any character of a link in running text; a link has at least one. */
const ANY_LETTER = anyGuarded([...PATH_LETTER, ...QUERY_LETTER]);

/**
 * A path, then a query or fragment, never ending in sentence punctuation ("x.com/sale." ends
 * before "."). Shared by links and bare-domain spans.
 */
export const URL_PATH = [
  `(?=${ANY_LETTER})`,
  `(?:${anyGuarded(HOST_LETTER)})*(?:\\/(?:${anyGuarded(PATH_LETTER)})*)?`,
  `(?:[?#](?:${anyGuarded(QUERY_LETTER)})*)?`,
  "(?<![.,;:!?])",
].join("");

/**
 * Case by character classes (anyCase), never "(?i:...)": under the "u" flag "(?i:s)" also
 * matches U+017F and "(?i:k)" U+212A, which no link scheme or attribute is written with.
 */
const SCHEME = String.raw`(?:${anyCase("http")}${anyCase("s")}?:\/\/|${anyCase("www")}\.)`;
const HREF = String.raw`\b${anyCase("href")}\s*=\s*(?<q>["'])`;
/** Inside href="..." or href='...' a link runs to the closing quote, whatever it holds. */
const QUOTED = String.raw`(?<=${HREF})${SCHEME}(?:(?!\k<q>)[^])*(?=\k<q>)`;

/**
 * A link: http(s) in any case or a bare www., in a quoted href (group `q`) or in running text.
 * The one link pattern of tokens and spans.
 */
export const URL_SOURCE = String.raw`${QUOTED}|\b${SCHEME}${URL_PATH}`;
