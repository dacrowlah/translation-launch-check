import { Parameter, ParameterType, type ToolsService } from "@optimizely-opal/opal-tools-sdk";
import { z } from "zod";

/** One tool: its name, the description the calling model reads, its parameters and handler. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly shape: z.ZodRawShape;
  readonly handler: (raw: unknown) => object;
}

const discovery = z.object({
  properties: z.record(
    z.string(),
    z.object({ type: z.enum(ParameterType), description: z.string().default("") }),
  ),
  required: z.array(z.string()),
});

/** The discovery parameters: each top-level key with its JSON type, description and need. */
const parametersOf = (shape: z.ZodRawShape): Parameter[] => {
  const { properties, required } = discovery.parse(z.toJSONSchema(z.object(shape)));
  return Object.entries(properties).map(
    ([key, p]) => new Parameter(key, p.type, p.description, required.includes(key)),
  );
};

/** The POST path the platform calls: localization_check -> /tools/localization-check. */
export const endpointOf = (name: string): string => `/tools/${name.replaceAll("_", "-")}`;

/** "METHOD /path" for every route the service answers: discovery and each tool. */
export const routesOf = (tools: readonly ToolDefinition[]): ReadonlySet<string> =>
  new Set(["GET /discovery", ...tools.map((tool) => `POST ${endpointOf(tool.name)}`)]);

/**
 * Registers the tool on this service only. The SDK's own registerTool() adds a tool to every
 * ToolsService the process ever created.
 */
export const registerOn = (service: ToolsService, tool: ToolDefinition): void => {
  const { name, description, shape, handler } = tool;
  service.registerTool(name, description, handler, parametersOf(shape), endpointOf(name));
};
