/** One tool call: its outcome, latency and counts. */
export interface ToolEvent {
  readonly event: "tool_call" | "defect";
  readonly tool: string;
  readonly status: string;
  readonly latency_ms: number;
  readonly lines: number;
  readonly locales: number;
}

/** A request refused before any tool ran (malformed JSON, a body over the limit). */
export interface RequestEvent {
  readonly event: "request_failed";
  readonly status: "invalid_request" | "internal_error";
}

export type LogEvent = ToolEvent | RequestEvent;

/** Structured, copy-free operational events. Never receives request text, headers or secrets. */
export interface Logger {
  event(e: LogEvent): void;
}
