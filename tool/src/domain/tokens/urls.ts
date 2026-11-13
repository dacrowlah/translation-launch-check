export interface Url {
  readonly raw: string;
  readonly host: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

const ALWAYS = /[.,;:!?"'\u00bb\u201d\u203a\u3002\uff09]$/u;
const OPENER: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

const count = (text: string, char: string): number => text.split(char).length - 1;

const unbalanced = (text: string): boolean => {
  const closer = text.at(-1) ?? "";
  const opener = OPENER[closer];
  return opener !== undefined && count(text, closer) > count(text, opener);
};

const strip = (text: string): string =>
  ALWAYS.test(text) || unbalanced(text) ? strip(text.slice(0, -1)) : text;

const shape = (url: URL, raw: string): Url => ({
  raw,
  host: url.hostname,
  path: url.pathname,
  query: Object.fromEntries(url.searchParams),
});

const parse = (raw: string): Url | null => {
  try {
    return shape(new URL(raw), raw);
  } catch {
    return null;
  }
};

const consume = (match: string, urls: Url[]): string => {
  const raw = strip(match);
  const url = parse(raw);
  if (url) urls.push(url);
  return url ? ` ${match.slice(raw.length)}` : match;
};

/** Finds http(s) URLs minus trailing punctuation; an unparseable one stays in rest. */
export const extractUrls = (text: string): { urls: Url[]; rest: string } => {
  const urls: Url[] = [];
  const rest = text.replace(/https?:\/\/\S+/gu, (match) => consume(match, urls));
  return { urls, rest };
};
