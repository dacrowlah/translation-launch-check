import { describe, expect, it } from "vitest";
import { layerViolations } from "./support/architecture.js";

const REJECTED: [string, string, string, string][] = [
  [
    "rejects_domain_importing_infrastructure",
    "src/domain/a.ts",
    "import x from '../infrastructure/b'",
    "src/domain/a.ts: domain must not import ../infrastructure/b",
  ],
  [
    "rejects_type_import",
    "src/domain/a.ts",
    "import type { X } from '../application/b';",
    "src/domain/a.ts: domain must not import ../application/b",
  ],
  [
    "rejects_export_from",
    "src/domain/a.ts",
    "export { X } from '../presentation/b';",
    "src/domain/a.ts: domain must not import ../presentation/b",
  ],
  [
    "rejects_dynamic_import",
    "src/domain/a.ts",
    "const m = await import('../infrastructure/b');",
    "src/domain/a.ts: domain must not import ../infrastructure/b",
  ],
  [
    "rejects_side_effect_import",
    "src/domain/a.ts",
    "import '../infrastructure/b';",
    "src/domain/a.ts: domain must not import ../infrastructure/b",
  ],
  [
    "rejects_multiline_named_import",
    "src/domain/a.ts",
    "import {\n  A,\n  B,\n} from '../infrastructure/b';",
    "src/domain/a.ts: domain must not import ../infrastructure/b",
  ],
  [
    "rejects_domain_reaching_config",
    "src/domain/checks/a.ts",
    "import r from '../../../config/rules.json';",
    "src/domain/checks/a.ts: domain must not import ../../../config/rules.json",
  ],
  [
    "rejects_domain_package",
    "src/domain/a.ts",
    "import e from 'express';",
    "src/domain/a.ts: domain must not import express",
  ],
  [
    "rejects_domain_zod_value",
    "src/domain/a.ts",
    "import { z } from 'zod';",
    "src/domain/a.ts: domain must not import zod",
  ],
  [
    "rejects_domain_node_builtin",
    "src/domain/a.ts",
    "import fs from 'node:fs';",
    "src/domain/a.ts: domain must not import node:fs",
  ],
  [
    "rejects_application_infrastructure",
    "src/application/a.ts",
    "import x from '../infrastructure/b';",
    "src/application/a.ts: application must not import ../infrastructure/b",
  ],
  [
    "rejects_infrastructure_presentation",
    "src/infrastructure/a.ts",
    "import x from '../presentation/b';",
    "src/infrastructure/a.ts: infrastructure must not import ../presentation/b",
  ],
  [
    "rejects_eld_outside_its_adapter",
    "src/infrastructure/other.ts",
    "import { eld } from 'eld';",
    "src/infrastructure/other.ts: infrastructure must not import eld",
  ],
  [
    "rejects_zod_outside_rules_schema",
    "src/infrastructure/other.ts",
    "import { z } from 'zod';",
    "src/infrastructure/other.ts: infrastructure must not import zod",
  ],
  [
    "rejects_presentation_infrastructure",
    "src/presentation/a.ts",
    "import x from '../infrastructure/b';",
    "src/presentation/a.ts: presentation must not import ../infrastructure/b",
  ],
  [
    "rejects_presentation_eld",
    "src/presentation/a.ts",
    "import { eld } from 'eld';",
    "src/presentation/a.ts: presentation must not import eld",
  ],
  [
    "rejects_api_importing_domain",
    "api/index.ts",
    "import x from '../src/domain/types';",
    "api/index.ts: api must not import ../src/domain/types",
  ],
  [
    "rejects_fake_importing_infrastructure",
    "test/support/fake.ts",
    "import x from '../../src/infrastructure/b';",
    "test/support/fake.ts: test-support must not import ../../src/infrastructure/b",
  ],
];

describe("layerViolations rejects", () => {
  it.each(REJECTED)("%s", (_name, path, source, message) => {
    expect(layerViolations({ [path]: source })).toEqual([message]);
  });
});
