import type { Logger } from "../domain/ports/logger";

export interface Handled<R> {
  readonly body: R;
  readonly lines: number;
  readonly locales: number;
}

const ms = (since: number): number => Math.round(performance.now() - since);

const succeed = <R>(logger: Logger, tool: string, since: number, done: Handled<R>): R => {
  const { body, ...counts } = done;
  logger.event({ event: "tool_call", tool, status: "ok", latency_ms: ms(since), ...counts });
  return body;
};

const fail = (logger: Logger, tool: string, since: number): never => {
  const none = { lines: 0, locales: 0 };
  logger.event({ event: "defect", tool, status: "error", latency_ms: ms(since), ...none });
  throw new Error("internal_error");
};

const guarded = <R>(logger: Logger, tool: string, run: () => Handled<R>): R => {
  const since = performance.now();
  try {
    return succeed(logger, tool, since, run());
  } catch {
    return fail(logger, tool, since);
  }
};

/** Logs one event per call; a throw is a defect: logged, then rethrown with no detail. */
export const safeHandler =
  <P, R>(tool: string, logger: Logger, fn: (params: P) => Handled<R>) =>
  (params: P): R =>
    guarded(logger, tool, () => fn(params));
