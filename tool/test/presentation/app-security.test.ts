import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleLogger } from "../../src/infrastructure/console-logger.js";
import { startApp, TOKEN } from "../support/app.js";
import { globalConsole } from "../support/console.js";
import { aBody, postText, postTo } from "../support/http.js";
import { SwitchableDetector } from "../support/language-detector.js";
import { aLogEvent } from "../support/telemetry.js";

const CHANNELS = ["log", "info", "debug", "warn", "error"] as const;
const realConsole = Object.fromEntries(CHANNELS.map((c) => [c, globalConsole()[c]]));
const consoleCalls: unknown[][] = [];
const detector = new SwitchableDetector();

let server: Server;
let base = "";
beforeAll(async () => {
  // createApp must replace every one of these with a no-op.
  CHANNELS.forEach((c) => (globalConsole()[c] = (...args) => void consoleCalls.push(args)));
  ({ server, base } = await startApp({ detector, logger: new ConsoleLogger() }));
});
afterAll(() => {
  Object.assign(globalConsole(), realConsole);
  server.close();
});

const written = { stdout: [] as string[], stderr: [] as string[] };
const capture = (stream: NodeJS.WriteStream, into: string[]) =>
  vi.spyOn(stream, "write").mockImplementation((chunk) => (into.push(String(chunk)), true));
beforeEach(() => {
  detector.throws = false;
  Object.assign(written, { stdout: [], stderr: [] });
  capture(process.stdout, written.stdout);
  capture(process.stderr, written.stderr);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const CHECK = "/tools/localization-check";
const check = async (body: unknown) => (await postTo(base, CHECK, body, TOKEN)).text();
const defect = async () => {
  detector.throws = true;
  return check(aBody());
};
const malformed = async () => (await postText(base, CHECK, "{", TOKEN)).text();

describe("what the app writes", () => {
  it("no_response_or_output_carries_the_token_or_the_word_authorization", async () => {
    const replies = [await check(aBody()), await check(aBody({ lines: 51 }))];
    replies.push(await defect(), await malformed());
    const everything = [...replies, ...written.stdout, ...written.stderr, String(consoleCalls)];
    expect(
      everything.filter((text) => text.includes(TOKEN) || /authorization/i.test(text)),
    ).toEqual([]);
  });

  it("an_invalid_call_writes_one_json_line_to_stdout_and_nothing_to_stderr", async () => {
    await check(aBody({ lines: 51 }));
    const line = aLogEvent({ tool: "localization_check", status: "invalid_input" });
    expect([written.stdout, written.stderr, consoleCalls]).toEqual([
      [`${JSON.stringify(line)}\n`],
      [],
      [],
    ]);
  });

  it("malformed_json_writes_one_bare_json_line_to_stdout", async () => {
    await malformed();
    const line = { event: "request_failed", status: "invalid_request" };
    expect([written.stdout, written.stderr]).toEqual([[`${JSON.stringify(line)}\n`], []]);
  });

  it("a_defect_writes_nothing_to_stderr", async () => {
    await defect();
    expect([written.stderr, consoleCalls]).toEqual([[], []]);
  });

  it("never_writes_copy_to_stdout", async () => {
    await check(aBody({ text: "ZZMARKER copy" }));
    expect([written.stdout.join("").includes("ZZMARKER"), written.stdout.length]).toEqual([
      false,
      1,
    ]);
    expect(consoleCalls).toEqual([]);
  });
});

const CALLBACK = {
  url: "https://callback.example.test/done",
  tool_call_id: "c1",
  callback_token: "t",
};
/** Stubs the global fetch: requests to the app go through; any other URL is recorded, not sent. */
const recordOutbound = (): string[] => {
  const realFetch = globalThis.fetch;
  const outbound: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url.startsWith(base) ? realFetch(url, init) : (outbound.push(url), new Response("{}")),
  );
  return outbound;
};
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("outbound requests", () => {
  // The SDK's async mode would POST the result to the caller-supplied async_callback URL.
  it("a_body_with_an_async_callback_gets_a_direct_reply_and_causes_no_outbound_request", async () => {
    const outbound = recordOutbound();
    const res = await postTo(base, CHECK, { ...aBody(), async_callback: CALLBACK }, TOKEN);
    const status = res.status;
    await res.text();
    await settled();
    expect([status, outbound]).toEqual([200, []]);
  });
});
