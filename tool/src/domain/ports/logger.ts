export interface LogEvent {
  readonly event: "tool_call" | "defect";
  readonly tool: string;
  readonly status: string;
  readonly latency_ms: number;
  readonly lines: number;
  readonly locales: number;
}

/** Structured, copy-free operational events. Never receives request text, headers or secrets. */
export interface Logger {
  event(e: LogEvent): void;
}
