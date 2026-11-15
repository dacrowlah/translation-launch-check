import type { Stopwatch } from "../domain/ports/stopwatch";

export class SystemStopwatch implements Stopwatch {
  start(): number {
    return performance.now();
  }

  elapsedMs(start: number): number {
    return Math.round(performance.now() - start);
  }
}
