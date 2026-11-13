import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import metz from "eslint-plugin-metz";

const FORBID = "@typescript-eslint/no-restricted-imports";
const SYNTAX = "no-restricted-syntax";

// Law of Demeter: no method call at the end of a property chain three levels deep
// (deps.cache.store.get(k)). Plain reads of config records and pipelines are exempt.
const LOD = {
  selector:
    "CallExpression > MemberExpression.callee > MemberExpression.object > MemberExpression.object",
  message: "Law of Demeter: do not call a method through a collaborator's collaborator.",
};
const NOW = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: "Date.now() belongs in src/infrastructure/system-clock.ts; inject Clock.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "new Date() belongs in src/infrastructure/system-clock.ts; inject Clock.",
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: "Date() belongs in src/infrastructure/system-clock.ts; inject Clock.",
  },
];
const CONSOLE = [
  {
    selector: "MemberExpression[object.name='console']",
    message: "console belongs in src/infrastructure/console-logger.ts; inject Logger.",
  },
];

const syntax = (...groups) => ["error", LOD, ...groups.flat()];

// Bare package imports, minus the named exceptions.
const bare = (...allowed) => ({
  regex: `^(?!\\.{1,2}(/|$)|(${allowed.join("|")})(/|$)).`,
  message: "This layer may not import this package (docs/standards/TOOL.md section 1).",
});
const reach = (...layers) => ({
  regex: `(^|/)(${layers.join("|")})(/|\\.js$|\\.ts$|$)`,
  message: "This layer may not import that layer (docs/standards/TOOL.md section 1).",
});
const forbid = (...patterns) => [
  "error",
  {
    patterns,
    paths: [{ name: "zod", allowTypeImports: true, message: "domain: zod types only." }],
  },
];
const forbidNoZodPaths = (...patterns) => ["error", { patterns }];

const OTHER_LAYERS = [
  "application",
  "infrastructure",
  "presentation",
  "main",
  "api",
  "test",
  "config",
];
const without = (...keep) => OTHER_LAYERS.filter((layer) => !keep.includes(layer));

export default defineConfig([
  { ignores: ["node_modules/**", ".vercel/**", "coverage/**", "dist/**"] },
  tseslint.configs.recommended,
  metz.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      [SYNTAX]: syntax(NOW, CONSOLE),
    },
  },
  {
    files: ["src/infrastructure/system-clock.ts"],
    rules: { [SYNTAX]: syntax(CONSOLE) },
  },
  {
    files: ["src/infrastructure/console-logger.ts"],
    rules: { [SYNTAX]: syntax(NOW) },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: { [FORBID]: forbid(bare("zod"), reach(...without())) },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: { [FORBID]: forbidNoZodPaths(bare(), reach(...without("application"))) },
  },
  {
    files: ["src/infrastructure/**/*.ts"],
    ignores: ["src/infrastructure/rules-schema.ts", "src/infrastructure/eld-detector.ts"],
    rules: {
      [FORBID]: forbidNoZodPaths(
        bare("node:[a-z/_]+"),
        reach(...without("application", "infrastructure")),
      ),
    },
  },
  {
    files: ["src/infrastructure/rules-schema.ts"],
    rules: {
      [FORBID]: forbidNoZodPaths(
        bare("node:[a-z/_]+", "zod"),
        reach(...without("application", "infrastructure")),
      ),
    },
  },
  {
    files: ["src/infrastructure/eld-detector.ts"],
    rules: {
      [FORBID]: forbidNoZodPaths(
        bare("node:[a-z/_]+", "eld"),
        reach(...without("application", "infrastructure")),
      ),
    },
  },
  {
    files: ["src/presentation/**/*.ts"],
    rules: {
      [FORBID]: forbidNoZodPaths(
        bare("@optimizely-opal/opal-tools-sdk", "zod"),
        reach(...without("application", "presentation")),
      ),
    },
  },
  {
    files: ["api/**/*.ts"],
    rules: { [FORBID]: forbidNoZodPaths(bare(), reach(...without("main", "api"))) },
  },
  {
    files: ["test/support/**/*.ts"],
    rules: { [FORBID]: forbidNoZodPaths(reach("infrastructure", "presentation")) },
  },
]);
