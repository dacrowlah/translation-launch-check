import type { ToolsService } from "@optimizely-opal/opal-tools-sdk";
import type { z } from "zod";

export const pathOf = (tool: string): string => `/tools/${tool.replace(/_/g, "-")}`;

interface Req {
  body: { parameters?: unknown } | undefined;
}
interface Res {
  status(code: number): { json(body: unknown): void };
}
interface Route {
  post(path: string, handler: (req: Req, res: Res, next: () => void) => void): void;
}

const issuesOf = (error: z.ZodError) =>
  error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

const reject = (res: Res, error: z.ZodError): void =>
  res.status(400).json({ error: "validation_error", issues: issuesOf(error) });

const gateFor = (schema: z.ZodType) => (req: Req, res: Res, next: () => void) => {
  const parsed = schema.safeParse(req.body?.parameters ?? req.body);
  if (!parsed.success) return reject(res, parsed.error);
  req.body = { ...req.body, parameters: parsed.data };
  next();
};

/**
 * The SDK does not validate input at request time. This route runs after the SDK's bearer
 * check and before its handler, answers 400 on bad input and hands the parsed value on.
 * It reaches the service's router (private in the typings; the SDK has no hook for this).
 */
export const validationGate = (service: ToolsService, tool: string, schema: z.ZodType): void => {
  const router: Route = service["router"];
  router.post(pathOf(tool), gateFor(schema));
};
