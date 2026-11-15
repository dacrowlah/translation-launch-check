import { ToolsService } from "@optimizely-opal/opal-tools-sdk";
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import rulesJson from "../config/rules.json" with { type: "json" };
import type { Clock } from "./domain/ports/clock.js";
import type { LanguageDetector } from "./domain/ports/language-detector.js";
import type { Logger } from "./domain/ports/logger.js";
import type { Stopwatch } from "./domain/ports/stopwatch.js";
import type { Rules } from "./domain/rules.js";
import { ConsoleLogger, quietConsole } from "./infrastructure/console-logger.js";
import { EldLanguageDetector } from "./infrastructure/eld-detector.js";
import { parseRules } from "./infrastructure/rules-schema.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { SystemStopwatch } from "./infrastructure/system-stopwatch.js";
import { copyFitCheckTool } from "./presentation/copy-fit-check-tool.js";
import { localizationCheckTool } from "./presentation/localization-check-tool.js";
import { registerOn, routesOf, type ToolDefinition } from "./presentation/tool-definition.js";

export interface AppConfig {
  readonly token: string | undefined;
  readonly rules: Rules;
  readonly clock: Clock;
  readonly detector: LanguageDetector;
  readonly logger: Logger;
  readonly stopwatch: Stopwatch;
}

const MIN_TOKEN_LENGTH = 32;
// Covers a 64 KB CSV's package with JSON escaping; real code-step calls are far smaller.
const BODY_LIMIT = "256kb";

const requireToken = (token: string | undefined): string => {
  if (token === undefined || token !== token.trim() || token.length < MIN_TOKEN_LENGTH)
    throw new Error(`TOOL_BEARER_TOKEN must be set and at least ${MIN_TOKEN_LENGTH} characters`);
  return token;
};

const isFourHundred = (status: number): boolean => status >= 400 && status < 500;

/** An HTTP 4xx from the body parser: malformed JSON, a body over the limit, a bad charset. */
const isClientError = (err: unknown): boolean =>
  err instanceof Error &&
  "status" in err &&
  typeof err.status === "number" &&
  isFourHundred(err.status);

/**
 * Body-parser failures (malformed JSON, too large) and defects: a status token, nothing else,
 * and one log event with no body and no error message.
 */
const failGenerically =
  (logger: Logger): ErrorRequestHandler =>
  (err, _req, res, next) => {
    if (res.headersSent) return next(err);
    const status = isClientError(err) ? "invalid_request" : "internal_error";
    logger.event({ event: "request_failed", status });
    res.status(200).json({ status });
  };

/** Anything but discovery and our tools never reaches the SDK (no echo of names or paths). */
const onlyRoutes =
  (routes: ReadonlySet<string>): RequestHandler =>
  (req, res, next) => {
    if (routes.has(`${req.method} ${req.path}`)) return next();
    res.status(404).json({ status: "not_found" });
  };

const toolsOf = (config: AppConfig): ToolDefinition[] => {
  const { rules, clock, detector, logger, stopwatch } = config;
  const telemetry = { logger, stopwatch };
  return [
    localizationCheckTool({ rules, clock, detector }, telemetry),
    copyFitCheckTool(rules, telemetry),
  ];
};

const mountTools = (app: Express, config: AppConfig): void => {
  const bearerToken = requireToken(config.token);
  const tools = toolsOf(config);
  app.use(onlyRoutes(routesOf(tools)), express.json({ limit: BODY_LIMIT }));
  const service = new ToolsService(app, { authMode: "static_token", bearerToken });
  tools.forEach((tool) => registerOn(service, tool));
};

export const createApp = (config: AppConfig): Express => {
  const app = express().disable("x-powered-by");
  mountTools(app, config);
  quietConsole();
  return app.use(failGenerically(config.logger));
};

const adapters = () => ({
  clock: new SystemClock(),
  detector: new EldLanguageDetector(),
  logger: new ConsoleLogger(),
  stopwatch: new SystemStopwatch(),
});

export const defaultApp = (): Express =>
  createApp({ token: process.env.TOOL_BEARER_TOKEN, rules: parseRules(rulesJson), ...adapters() });
