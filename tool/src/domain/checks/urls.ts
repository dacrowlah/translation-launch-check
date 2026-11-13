import type { Url } from "../tokens/urls";
import { pairUrls, type UrlPair } from "./url-pairing";
import { resultOf, type MultiCheck, type Row, type Spec } from "./compare";

export const URL_PARAMS_DETAIL =
  "A link is missing, points elsewhere, or lost a tracking parameter.";
export const URL_PATH_DETAIL = "A link uses a different (localized) path.";

const PARAMS: Spec = { check: "url_params", detail: URL_PARAMS_DETAIL };
const PATH: Spec = { check: "url_path", detail: URL_PATH_DETAIL };

const named = (url: Url, key: string): string => `${key}=${url.query[key]}`;

const changedRows = (master: Url, target: Url): Row[] =>
  Object.keys(master.query)
    .filter((key) => target.query[key] !== master.query[key])
    .map((key): Row => [named(master, key), key in target.query ? named(target, key) : undefined]);

const extraRows = (master: Url, target: Url): Row[] =>
  Object.keys(target.query)
    .filter((key) => !(key in master.query))
    .map((key): Row => [undefined, named(target, key)]);

const queryRows = (master: Url, target: Url): Row[] => [
  ...changedRows(master, target),
  ...extraRows(master, target),
];

const hostRows = (master: Url, target: Url): Row[] =>
  master.host === target.host ? [] : [[master.host, target.host]];

const paramRows = (master: Url | undefined, target: Url | undefined): Row[] => {
  if (master === undefined || target === undefined) return [[master?.raw, target?.raw]];
  return [...hostRows(master, target), ...queryRows(master, target)];
};

const pathRows = (master: Url | undefined, target: Url | undefined): Row[] =>
  master && target && master.path !== target.path ? [[master.path, target.path]] : [];

const rowsOf = (pairs: readonly UrlPair[], rows: (m?: Url, t?: Url) => Row[]): Row[] =>
  pairs.flatMap(([m, t]) => rows(m, t));

export const checkUrls: MultiCheck = (pair, ctx) => {
  const pairs = pairUrls(pair.master.urls, pair.target.urls);
  const applicable = pairs.length > 0;
  return {
    url_params: resultOf(ctx.rules, PARAMS, applicable, rowsOf(pairs, paramRows)),
    url_path: resultOf(ctx.rules, PATH, applicable, rowsOf(pairs, pathRows)),
  };
};
