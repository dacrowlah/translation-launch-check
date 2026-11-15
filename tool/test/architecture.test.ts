import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layerViolations } from "./support/architecture.js";

const check = (path: string, source: string) => layerViolations({ [path]: source });

const ACCEPTED: [string, string, string][] = [
  [
    "accepts_domain_importing_domain",
    "src/domain/checks/a.ts",
    "import x from '../types';\nimport y from './b';",
  ],
  ["accepts_domain_zod_types", "src/domain/a.ts", "import type { ZodType } from 'zod';"],
  [
    "accepts_application_importing_domain",
    "src/application/a.ts",
    "import x from '../domain/ports/clock';",
  ],
  [
    "accepts_infrastructure_node_builtins",
    "src/infrastructure/a.ts",
    "import { readFileSync } from 'node:fs';\nimport x from '../application/b';",
  ],
  [
    "accepts_eld_in_its_adapter",
    "src/infrastructure/eld-detector.ts",
    "import { eld } from 'eld';",
  ],
  ["accepts_zod_in_rules_schema", "src/infrastructure/rules-schema.ts", "import { z } from 'zod';"],
  [
    "accepts_presentation_sdk_and_zod",
    "src/presentation/a.ts",
    "import { ToolsService } from '@optimizely-opal/opal-tools-sdk';\nimport { z } from 'zod/v4';\nimport x from '../application/b';",
  ],
  [
    "accepts_main_importing_everything",
    "src/main.ts",
    "import e from 'express';\nimport a from './infrastructure/b';\nimport r from '../config/rules.json';",
  ],
  ["accepts_api_importing_main", "api/index.ts", "import { createApp } from '../src/main';"],
  [
    "accepts_fake_importing_domain",
    "test/support/fake.ts",
    "import type { Clock } from '../../src/domain/ports/clock';",
  ],
  [
    "accepts_code_without_imports",
    "src/domain/a.ts",
    "export const a = 1; // import x from '../infrastructure/b' is only text here",
  ],
];

function sourcesUnder(dir: string): Record<string, string> {
  if (!existsSync(dir)) return {};
  const names = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((n) =>
    n.endsWith(".ts"),
  );
  return Object.fromEntries(names.map((n) => [`${dir}/${n}`, readFileSync(`${dir}/${n}`, "utf8")]));
}

describe("layerViolations", () => {
  it.each(ACCEPTED)("%s", (_name, path, source) => {
    expect(check(path, source)).toEqual([]);
  });

  it("reports_every_violation_in_every_file", () => {
    const files = {
      "src/domain/a.ts": "import 'express';\nimport '../application/b';",
      "src/domain/c.ts": "import '../infrastructure/d';",
    };
    expect(layerViolations(files)).toHaveLength(3);
  });

  it("passes_an_empty_file_map", () => {
    expect(layerViolations({})).toEqual([]);
  });
});

/** Paths are relative to tool/: a run from another directory scans nothing, so count them. */
const realTree = (): Record<string, string> => ({ ...sourcesUnder("src"), ...sourcesUnder("api") });

describe("the real source tree", () => {
  it("scans_at_least_60_files", () => {
    expect(Object.keys(realTree()).length).toBeGreaterThanOrEqual(60);
  });
  it("respects_the_layer_table", () => {
    expect(layerViolations(realTree())).toEqual([]);
  });
});
