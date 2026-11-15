import type { ToolEvent } from "../../src/domain/ports/logger.js";
import { RecordingLogger } from "./logger.js";
import { FakeStopwatch } from "./stopwatch.js";

/** What safeHandler logs through: a RecordingLogger, and a stopwatch that reads 7 ms. */
export const aTelemetry = () => ({
  logger: new RecordingLogger(),
  stopwatch: new FakeStopwatch(7),
});

/** The event aTelemetry() records for one call: tool_call, 7 ms and no counts unless given. */
export const aLogEvent = (over: Pick<ToolEvent, "tool" | "status"> & Partial<ToolEvent>) => ({
  ...{ event: "tool_call", tool: over.tool, status: over.status, latency_ms: 7 },
  ...{ lines: 0, locales: 0 },
  ...over,
});
