import type { z } from "zod";
import type { Logger } from "../domain/ports/logger";

/** Rejects a Promise result at compile time (anything PromiseLike collapses to never). */
type Sync<R> = R extends PromiseLike<unknown> ? never : unknown;

export interface Handled<R> {
  readonly body: R;
  readonly lines: number;
  readonly locales: number;
}

class InvalidInputError extends Error {}

const ms = (since: number): number => Math.round(performance.now() - since);

const isThenable = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | null)?.then === "function";

const accept = <P>(schema: z.ZodType<P>, raw: unknown): P => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new InvalidInputError();
  return parsed.data;
};

const succeed = <R>(logger: Logger, tool: string, since: number, d: Handled<R>): R => {
  if (isThenable(d.body)) throw new Error("handler returned a promise");
  const { body, ...counts } = d;
  logger.event({ event: "tool_call", tool, status: "ok", latency_ms: ms(since), ...counts });
  return body;
};

const outcomeOf = (error: unknown) =>
  error instanceof InvalidInputError
    ? ({ event: "tool_call", status: "invalid_input", message: "invalid_input" } as const)
    : ({ event: "defect", status: "error", message: "internal_error" } as const);

const fail = (logger: Logger, tool: string, since: number, error: unknown): never => {
  const { message, ...logged } = outcomeOf(error);
  logger.event({ ...logged, tool, latency_ms: ms(since), lines: 0, locales: 0 });
  throw new Error(message);
};

const guarded = <R>(logger: Logger, tool: string, run: () => Handled<R>): R => {
  const since = performance.now();
  try {
    return succeed(logger, tool, since, run());
  } catch (error) {
    return fail(logger, tool, since, error);
  }
};

/**
 * Validates the raw params (no work on failure), logs one event per call. Invalid input
 * throws a fixed "invalid_input"; any other throw is a defect: "internal_error". Neither
 * message carries input, zod text or the original error.
 */
export const safeHandler =
  <P, R>(
    tool: string,
    logger: Logger,
    schema: z.ZodType<P>,
    fn: (params: P) => Handled<R> & Sync<R>,
  ) =>
  (raw: unknown): R =>
    guarded(logger, tool, () => fn(accept(schema, raw)));
