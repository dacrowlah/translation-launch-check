import { createApp, type AppConfig } from "../../src/main.js";
import { aDeps } from "./builders.js";
import { listen } from "./http.js";
import { aTelemetry } from "./telemetry.js";

export const TOKEN = "t".repeat(32);

/** A createApp config: aDeps(), TOKEN and aTelemetry(). */
export const anAppConfig = (over: Partial<AppConfig> = {}): AppConfig => ({
  token: TOKEN,
  ...aDeps(),
  ...aTelemetry(),
  ...over,
});

/** createApp(anAppConfig(over)) listening on a free port. */
export const startApp = (over: Partial<AppConfig> = {}) => listen(createApp(anAppConfig(over)));
