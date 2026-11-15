/** Every scaling test may take this long; only a hang or a blow-up exceeds it. */
export const SCALING_TIMEOUT = 60_000;
/** A linear operation takes about 4 times as long on 4 times the input; a quadratic one 16. */
export const LINEAR_GROWTH = 8;
/** A sample of the small size runs at least this long, so timer and scheduler noise stay small. */
const MIN_SAMPLE_MS = 20;

/** CPU time of `run`, after a full collection when the perf gate exposes it (--expose-gc). */
export const cpuMs = (run: () => void): number => {
  globalThis.gc?.();
  const started = process.cpuUsage();
  run();
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1000;
};

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** `run` on `size`, `times` times over: one sample. */
const sampleOf = (run: (size: number) => void, size: number, times: number): number =>
  cpuMs(() => Array.from({ length: times }, () => run(size)));

/** 5 samples of each size, n and 4n taken in turn, each size repeated as often. */
const timings = (run: (size: number) => void, size: number, times: number): [number, number][] =>
  Array.from({ length: 5 }, () => [sampleOf(run, size, times), sampleOf(run, 4 * size, times)]);

/** How often a sample repeats `run` so that one of the small size takes MIN_SAMPLE_MS. */
const repeatsFor = (run: (size: number) => void, size: number): number =>
  Math.ceil(
    MIN_SAMPLE_MS /
      Math.max(
        cpuMs(() => run(size)),
        0.05,
      ),
  );

/**
 * How many times longer `run` takes on 4n inputs than on n: the median of 5 CPU samples of
 * each size, after a warm-up of each (the small one also sets how often a sample repeats the
 * run). Load slows both alike, so the ratio stays near 4 for linear work and near 16 for
 * quadratic work. The perf gate runs these tests one at a time.
 */
export const growth = (run: (size: number) => void, size: number): number => {
  run(4 * size);
  const pairs = timings(run, size, repeatsFor(run, size));
  const [small, large] = [median(pairs.map(([s]) => s)), median(pairs.map(([, l]) => l))];
  return large / Math.max(small, 0.05);
};
