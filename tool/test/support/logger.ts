import type { Logger, LogEvent } from "../../src/domain/ports/logger";

/** Keeps every logged event for assertions. */
export class RecordingLogger implements Logger {
  readonly events: LogEvent[] = [];

  event(e: LogEvent): void {
    this.events.push(e);
  }
}
