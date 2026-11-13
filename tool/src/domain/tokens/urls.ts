export interface Url {
  readonly raw: string;
  readonly host: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

const TRAILING = /[.,;:!?)\]}»"']+$/u;

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
  const raw = match.replace(TRAILING, "");
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
