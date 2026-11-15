import { params, type Url } from "../tokens/urls";
import { pairUrls, type UrlPair } from "./url-pairing";
import { diffRows, resultOf, type MultiCheck, type Row, type Spec } from "./compare";

export const URL_PARAMS_DETAIL =
  "A link is missing, points elsewhere, or lost a tracking parameter.";
export const URL_PATH_DETAIL = "A link uses a different (localized) path.";

const PARAMS: Spec = { check: "url_params", detail: URL_PARAMS_DETAIL };
const PATH: Spec = { check: "url_path", detail: URL_PATH_DETAIL };

/** Query parameters compared as a multiset of "key=value" strings. */
const queryRows = (master: Url, target: Url): Row[] => diffRows(params(master), params(target));

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
