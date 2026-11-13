import type { Url } from "../tokens/urls";

export type UrlPair = [Url | undefined, Url | undefined];
type Same = (a: Url, b: Url) => boolean;
interface State {
  readonly masters: Url[];
  readonly targets: Url[];
  readonly pairs: [Url, Url][];
}

const queryKey = (url: Url): string => JSON.stringify(Object.entries(url.query).sort());
const samePath = (a: Url, b: Url): boolean => a.host === b.host && a.path === b.path;

/** Strongest match first; the last pass pairs whatever is left in order of appearance. */
const PASSES: readonly Same[] = [
  (a, b) => a.raw === b.raw,
  (a, b) => samePath(a, b) && queryKey(a) === queryKey(b),
  samePath,
  () => true,
];

/** Moves the first target that matches into pairs; false when none does. */
const claim = (state: State, master: Url, same: Same): boolean => {
  const at = state.targets.findIndex((target) => same(master, target));
  const [target] = at < 0 ? [] : state.targets.splice(at, 1);
  if (target) state.pairs.push([master, target]);
  return target !== undefined;
};

const pass = (state: State, same: Same): State => ({
  ...state,
  masters: state.masters.filter((master) => !claim(state, master, same)),
});

/** Pairs links in passes (exact, same page and query, same page, then in order). */
export const pairUrls = (masters: readonly Url[], targets: readonly Url[]): UrlPair[] => {
  const end = PASSES.reduce(pass, { masters: [...masters], targets: [...targets], pairs: [] });
  const matched = end.pairs.sort((a, b) => masters.indexOf(a[0]) - masters.indexOf(b[0]));
  return [...matched, ...end.masters.map((m): UrlPair => [m, undefined])].concat(
    end.targets.map((t): UrlPair => [undefined, t]),
  );
};
