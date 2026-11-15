import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

interface Listener {
  listen(port: number): Server;
}

/** Starts the app on a free port; resolves with the server and its base URL. */
export const listen = async (app: Listener): Promise<{ server: Server; base: string }> => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

const line = (id: string, text: string) => ({
  id,
  channel: "email",
  field: "body",
  texts: { "en-US": text, "de-DE": "Sparen Sie heute" },
});
const linesOf = (count: number, text: string) =>
  Array.from({ length: count }, (_, i) => line(`L${i}`, text));
const parametersOf = (lines: unknown[]) => ({
  ...{ campaign: "Spring Sale", master_locale: "en-US", locales: ["de-DE"] },
  lines,
});
export const aBody = (over: { text?: string; lines?: number } = {}) => ({
  parameters: parametersOf(linesOf(over.lines ?? 1, over.text ?? "Save")),
  ...{ auth_credentials: {}, environment: {}, chat_metadata: {} },
});

const headersFor = (token: string | null): Record<string, string> => ({
  "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

export interface RawRequest {
  readonly method: string;
  readonly path: string;
  /** Sent as is: malformed or oversized JSON too. */
  readonly body?: string | undefined;
  /** The bearer token, or null for none. */
  readonly token: string | null;
}

export const send = (base: string, request: RawRequest) => {
  const { method, path, body, token } = request;
  return fetch(base + path, {
    method,
    headers: headersFor(token),
    ...(body === undefined ? {} : { body }),
  });
};

/** POSTs `text` as is, with the bearer token unless null. */
export const postText = (base: string, path: string, text: string, token: string | null) =>
  send(base, { method: "POST", path, body: text, token });

export const postTo = (base: string, path: string, body: unknown, token: string | null) =>
  postText(base, path, JSON.stringify(body), token);

/** [HTTP status, parsed JSON body]. */
export const outcome = async (res: Response): Promise<[number, unknown]> => [
  res.status,
  await res.json(),
];

export interface DiscoveredFunction {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly { name: string; type: string; required: boolean }[];
}

/** The functions GET /discovery lists (no token: discovery is public). */
export const discoveryOf = async (base: string): Promise<DiscoveredFunction[]> => {
  const body = (await (await fetch(`${base}/discovery`)).json()) as {
    functions: DiscoveredFunction[];
  };
  return body.functions;
};
