import type { LogEvent, Logger } from "../domain/ports/logger";

/** One JSON line per event on stdout. */
export class ConsoleLogger implements Logger {
  event(e: LogEvent): void {
    process.stdout.write(`${JSON.stringify(e)}\n`);
  }
}

const noop = (): void => undefined;

/**
 * The SDK console.logs full request bodies and tool results (campaign copy). Silence those
 * channels. console.error stays: the SDK only passes it our generic "internal_error".
 */
export const quietConsole = (target: Console = console): void => {
  Object.assign(target, { log: noop, info: noop, debug: noop, warn: noop });
};
