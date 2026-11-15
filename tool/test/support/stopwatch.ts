import type { Stopwatch } from "../../src/domain/ports/stopwatch.js";

/** Every call takes exactly `elapsed` milliseconds. */
export class FakeStopwatch implements Stopwatch {
  constructor(private readonly elapsed: number) {}

  start(): number {
    return 0;
  }

  elapsedMs(): number {
    return this.elapsed;
  }
}
