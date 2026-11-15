/** Measures how long a call took, on a monotonic clock. */
export interface Stopwatch {
  /** A start mark, to hand back to elapsedMs. */
  start(): number;
  /** Whole milliseconds since the mark. */
  elapsedMs(start: number): number;
}
