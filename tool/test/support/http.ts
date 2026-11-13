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

export const postTo = (base: string, path: string, body: unknown, token: string | null) =>
  fetch(base + path, { method: "POST", headers: headersFor(token), body: JSON.stringify(body) });
