/** The process-wide console, for tests that prove the SDK's logging is silenced. */
export const globalConsole = (): Console => globalThis.console;
