import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startApp, TOKEN } from "../support/app";
import { discoveryOf, outcome, postText, postTo, send } from "../support/http";
import { RecordingLogger } from "../support/logger";

const logger = new RecordingLogger();
const servers: Server[] = [];
let base = "";
beforeEach(() => (logger.events.length = 0));
beforeAll(async () => {
  const started = await startApp({ logger });
  servers.push(started.server);
  base = started.base;
});
afterAll(() => servers.forEach((server) => server.close()));

const LIMIT_BYTES = 256 * 1024;
const COPY_FIT = "/tools/copy-fit-check";

/** A valid JSON body of exactly `bytes` bytes (ASCII), with no items to check. */
const padded = (bytes: number): string => {
  const head = '{"parameters":{"items":[]},"pad":"';
  return `${head}${"x".repeat(bytes - head.length - 2)}"}`;
};

const NOT_FOUND = [404, { status: "not_found" }];
// [what, method, path, body]: none of these reaches the SDK, nor echoes its input.
const UNKNOWN: [string, string, string, string | undefined][] = [
  ["an_sdk_interaction", "POST", "/interactions/execute", '{"name":"<script>secret</script>"}'],
  ["an_sdk_resource", "POST", "/resources/read", '{"uri":"x-secret"}'],
  ["an_unknown_tool_path", "GET", "/tools/%3Cb%3E", undefined],
  ["a_tool_called_with_get", "GET", "/tools/localization-check", undefined],
  ["discovery_called_with_post", "POST", "/discovery", "{}"],
  // Fails if the allow-list moves after the body parser: that would answer invalid_request.
  ["an_unknown_route_with_a_malformed_body", "POST", "/interactions/execute", "{"],
];

describe("transport", () => {
  it("malformed_json_is_the_bare_invalid_request_token_and_one_bare_log_event", async () => {
    const res = await postText(base, COPY_FIT, "{", TOKEN);
    expect([await outcome(res), logger.events]).toEqual([
      [200, { status: "invalid_request" }],
      [{ event: "request_failed", status: "invalid_request" }],
    ]);
  });

  it("a_body_of_exactly_256_kb_is_parsed_and_validated", async () => {
    const res = await postText(base, COPY_FIT, padded(LIMIT_BYTES), TOKEN);
    expect(await outcome(res)).toEqual([200, { status: "invalid_input" }]);
  });

  it("a_body_one_byte_over_256_kb_is_invalid_request", async () => {
    const res = await postText(base, COPY_FIT, padded(LIMIT_BYTES + 1), TOKEN);
    expect(await outcome(res)).toEqual([200, { status: "invalid_request" }]);
  });

  // The body parser runs before the SDK's bearer check; there is no second token check.
  it("an_unauthenticated_malformed_body_is_invalid_request_not_401", async () => {
    expect(await outcome(await postText(base, COPY_FIT, "{", null))).toEqual([
      200,
      { status: "invalid_request" },
    ]);
  });

  it.each(UNKNOWN)("%s_is_404_not_found", async (_what, method, path, body) => {
    expect(await outcome(await send(base, { method, path, body, token: TOKEN }))).toEqual(
      NOT_FOUND,
    );
  });

  it("an_unknown_route_is_404_even_without_a_token", async () => {
    expect(await outcome(await postTo(base, "/tools/other", {}, null))).toEqual(NOT_FOUND);
  });
});

describe("two apps in one process", () => {
  it("each_app_lists_each_tool_exactly_once", async () => {
    const second = await startApp();
    servers.push(second.server);
    const names = async (at: string) => (await discoveryOf(at)).map((f) => f.name);
    const both = ["localization_check", "copy_fit_check"];
    expect([await names(base), await names(second.base)]).toEqual([both, both]);
  });
});
