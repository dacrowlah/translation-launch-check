/** An HTML character reference: "&nbsp;", "&#160;" or "&#xA0;". */
export const REFERENCE = "&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);";

/** The named references marketing HTML uses; looked up as own keys only. */
const NAMED: ReadonlyMap<string, string> = new Map([
  ["nbsp", "\u00a0"],
  ["thinsp", "\u2009"],
  ["ensp", "\u2002"],
  ["emsp", "\u2003"],
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["ndash", "\u2013"],
  ["mdash", "\u2014"],
  ["hellip", "\u2026"],
  ["lsquo", "\u2018"],
  ["rsquo", "\u2019"],
  ["ldquo", "\u201c"],
  ["rdquo", "\u201d"],
  ["laquo", "\u00ab"],
  ["raquo", "\u00bb"],
  ["euro", "\u20ac"],
  ["pound", "\u00a3"],
  ["yen", "\u00a5"],
  ["copy", "\u00a9"],
  ["reg", "\u00ae"],
  ["trade", "\u2122"],
]);

/** NUL, surrogates and noncharacters are no character. */
const usable = (code: number): boolean =>
  code > 0 &&
  code <= 0x10ffff &&
  !(code >= 0xd800 && code <= 0xdfff) &&
  !(code >= 0xfdd0 && code <= 0xfdef) &&
  (code & 0xfffe) !== 0xfffe;

const codePoint = (digits: string): string => {
  const code = /^x/iu.test(digits) ? parseInt(digits.slice(1), 16) : Number(digits);
  return usable(code) ? String.fromCodePoint(code) : "";
};

/** One reference as its character; an unknown name stays as written, an unusable number is "". */
export const decodeReference = (reference: string): string => {
  const body = reference.slice(1, -1);
  return body.startsWith("#") ? codePoint(body.slice(1)) : (NAMED.get(body) ?? reference);
};

const REFERENCES = new RegExp(REFERENCE, "gu");

export const decodeReferences = (text: string): string => text.replace(REFERENCES, decodeReference);
