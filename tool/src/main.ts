import { ToolsService } from "@optimizely-opal/opal-tools-sdk";
import express, { type ErrorRequestHandler, type Express } from "express";
import rulesJson from "../config/rules.json" with { type: "json" };
import type { Clock } from "./domain/ports/clock";
import type { LanguageDetector } from "./domain/ports/language-detector";
import type { Logger } from "./domain/ports/logger";
import type { Rules } from "./domain/rules";
import { ConsoleLogger, quietConsole } from "./infrastructure/console-logger";
import { EldLanguageDetector } from "./infrastructure/eld-detector";
import { parseRules } from "./infrastructure/rules-schema";
import { SystemClock } from "./infrastructure/system-clock";
import { registerCopyFitCheck } from "./presentation/copy-fit-check-tool";
import { registerLocalizationCheck } from "./presentation/localization-check-tool";

export interface AppConfig {
  readonly token: string | undefined;
  readonly rules: Rules;
  readonly clock: Clock;
  readonly detector: LanguageDetector;
  readonly logger: Logger;
}

const MIN_TOKEN_LENGTH = 32;
// Covers a 64 KB CSV's package with JSON escaping; real code-step calls are far smaller.
const BODY_LIMIT = "256kb";

const requireToken = (token: string | undefined): string => {
  if (token === undefined || token !== token.trim() || token.length < MIN_TOKEN_LENGTH)
    throw new Error(`TOOL_BEARER_TOKEN must be set and at least ${MIN_TOKEN_LENGTH} characters`);
  return token;
};

const statusOf = (err: unknown): number => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : 500;
};

/** Body-parser failures (malformed JSON, too large): a generic body, never the parser's. */
const failGenerically: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = statusOf(err);
  res.status(status).json({ error: status === 500 ? "internal_error" : "invalid_request" });
};

const mountService = (app: Express, token: string | undefined): void => {
  const bearerToken = requireToken(token);
  app.use(express.json({ limit: BODY_LIMIT }));
  new ToolsService(app, { authMode: "static_token", bearerToken });
};

const registerTools = (config: AppConfig): void => {
  registerLocalizationCheck(config, config.logger);
  registerCopyFitCheck(config.rules, config.logger);
};

export const createApp = (config: AppConfig): Express => {
  const app = express().disable("x-powered-by");
  mountService(app, config.token);
  registerTools(config);
  quietConsole();
  return app.use(failGenerically);
};

const adapters = () => ({
  clock: new SystemClock(),
  detector: new EldLanguageDetector(),
  logger: new ConsoleLogger(),
});

export const defaultApp = (): Express =>
  createApp({ token: process.env.TOOL_BEARER_TOKEN, rules: parseRules(rulesJson), ...adapters() });
