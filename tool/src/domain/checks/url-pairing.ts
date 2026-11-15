import { params, type Url } from "../tokens/urls.js";

export type UrlPair = [Url | undefined, Url | undefined];
type Same = (a: Url, b: Url) => boolean;
interface State {
  readonly masters: readonly Url[];
  readonly targets: readonly Url[];
  readonly pairs: readonly (readonly [Url, Url])[];
}

const queryKey = (url: Url): string => JSON.stringify(params(url).sort());
const samePath = (a: Url, b: Url): boolean => a.host === b.host && a.path === b.path;

/** Strongest match first; the last pass pairs whatever is left in order of appearance. */
const PASSES: readonly Same[] = [
  (a, b) => a.raw === b.raw,
  (a, b) => samePath(a, b) && queryKey(a) === queryKey(b),
  samePath,
  () => true,
];

/** The state with this master paired to the first target that matches, or kept unpaired. */
const claim =
  (same: Same) =>
  (state: State, master: Url): State => {
    const target = state.targets.find((t) => same(master, t));
    if (target === undefined) return { ...state, masters: [...state.masters, master] };
    const targets = state.targets.filter((t) => t !== target);
    return { masters: state.masters, targets, pairs: [...state.pairs, [master, target]] };
  };

const pass = (state: State, same: Same): State =>
  state.masters.reduce(claim(same), { ...state, masters: [] });

const leftovers = (end: State): UrlPair[] => [
  ...end.masters.map((m): UrlPair => [m, undefined]),
  ...end.targets.map((t): UrlPair => [undefined, t]),
];

/** Pairs links in passes (exact, same page and query, same page, then in order). */
export const pairUrls = (masters: readonly Url[], targets: readonly Url[]): UrlPair[] => {
  const end = PASSES.reduce(pass, { masters, targets, pairs: [] });
  const matched = [...end.pairs].sort((a, b) => masters.indexOf(a[0]) - masters.indexOf(b[0]));
  return [...matched.map(([m, t]): UrlPair => [m, t]), ...leftovers(end)];
};
