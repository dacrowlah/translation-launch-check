import type { Stopwatch } from "../domain/ports/stopwatch.js";

export class SystemStopwatch implements Stopwatch {
  start(): number {
    return performance.now();
  }

  elapsedMs(start: number): number {
    return Math.round(performance.now() - start);
  }
}
