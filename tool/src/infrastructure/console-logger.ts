import type { LogEvent, Logger } from "../domain/ports/logger.js";

/** One JSON line per event on stdout. */
export class ConsoleLogger implements Logger {
  event(e: LogEvent): void {
    process.stdout.write(`${JSON.stringify(e)}\n`);
  }
}

const noop = (): void => undefined;

type Channels = Pick<Console, "log" | "info" | "debug" | "warn" | "error">;

/**
 * The SDK console.logs full request bodies and tool results (campaign copy), and
 * console.errors a stack with file paths when a handler throws. Silence every channel; our
 * own events go to stdout through ConsoleLogger.
 */
export const quietConsole = (target: Channels = console): void => {
  Object.assign(target, { log: noop, info: noop, debug: noop, warn: noop, error: noop });
};
