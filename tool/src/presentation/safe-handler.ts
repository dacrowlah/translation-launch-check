import type { z } from "zod";
import type { Logger, ToolEvent } from "../domain/ports/logger";
import type { Stopwatch } from "../domain/ports/stopwatch";

/** Rejects a Promise result at compile time (anything PromiseLike collapses to never). */
type Sync<R> = R extends PromiseLike<unknown> ? never : unknown;

export interface Handled<R> {
  readonly body: R;
  readonly lines: number;
  readonly locales: number;
}

export interface Telemetry {
  readonly logger: Logger;
  readonly stopwatch: Stopwatch;
}

/** A failed call carries its status token and nothing else: Mark reads responses aloud. */
type Failure = { readonly status: "invalid_input" | "internal_error" };
type Reply<R> = ({ readonly status: "ok" } & R) | Failure;

interface Call extends Telemetry {
  readonly tool: string;
  readonly start: number;
}

type Outcome = Omit<ToolEvent, "tool" | "latency_ms">;

const NO_COUNTS = { lines: 0, locales: 0 };

const isThenable = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | null)?.then === "function";

const record = (call: Call, outcome: Outcome): void => {
  const { event, status, ...counts } = outcome;
  const latency_ms = call.stopwatch.elapsedMs(call.start);
  call.logger.event({ event, tool: call.tool, status, latency_ms, ...counts });
};

const succeed = <R extends object>(call: Call, handled: Handled<R>): Reply<R> => {
  if (isThenable(handled) || isThenable(handled.body)) throw new Error("returned a promise");
  const { body, ...counts } = handled;
  record(call, { event: "tool_call", status: "ok", ...counts });
  return { ...body, status: "ok" };
};

const fail = (call: Call, event: ToolEvent["event"], status: Failure["status"]): Failure => {
  record(call, { event, status, ...NO_COUNTS });
  return { status };
};

const run = <P, R extends object>(
  call: Call,
  parsed: z.ZodSafeParseResult<P>,
  fn: (params: P) => Handled<R>,
): Reply<R> =>
  parsed.success ? succeed(call, fn(parsed.data)) : fail(call, "tool_call", "invalid_input");

const guarded = <P, R extends object>(
  call: Call,
  schema: z.ZodType<P>,
  raw: unknown,
  fn: (params: P) => Handled<R>,
): Reply<R> => {
  try {
    return run(call, schema.safeParse(raw), fn);
  } catch {
    return fail(call, "defect", "internal_error");
  }
};

/**
 * Validates the raw params (no work on failure) and logs one event per call. The reply is
 * {...body, status: "ok"} (a body never overrides the status), or a bare {status: "invalid_input"} or {status: "internal_error"}
 * (any throw is a defect): never input, zod text or the original error.
 */
export const safeHandler =
  <P, R extends object>(
    tool: string,
    telemetry: Telemetry,
    schema: z.ZodType<P>,
    fn: (params: P) => Handled<R> & Sync<R>,
  ) =>
  (raw: unknown): Reply<R> =>
    guarded({ ...telemetry, tool, start: telemetry.stopwatch.start() }, schema, raw, fn);
