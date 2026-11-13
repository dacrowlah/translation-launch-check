import { isBuiltin } from "node:module";
import { posix } from "node:path";

export type Files = Record<string, string>;
type Layer = "domain" | "application" | "infrastructure" | "presentation" | "main" | "api";
type Where = Layer | "config" | "test-support" | "test";
type Import = { file: string; spec: string; typeOnly: boolean };
type PackageRule = { name: string; file?: string; typeOnly?: boolean };

const PREFIXES: [string, Where][] = [
  ["src/domain/", "domain"],
  ["src/application/", "application"],
  ["src/infrastructure/", "infrastructure"],
  ["src/presentation/", "presentation"],
  ["src/main", "main"],
  ["api/", "api"],
  ["test/support/", "test-support"],
  ["test/", "test"],
  ["config/", "config"],
];

const LAYERS: Record<Where, Where[]> = {
  domain: ["domain"],
  application: ["domain", "application"],
  infrastructure: ["domain", "application", "infrastructure"],
  presentation: ["domain", "application", "presentation"],
  main: ["domain", "application", "infrastructure", "presentation", "main", "config"],
  api: ["main", "api"],
  "test-support": ["domain", "application", "main", "test-support", "test"],
  test: [
    "domain",
    "application",
    "infrastructure",
    "presentation",
    "main",
    "test-support",
    "test",
    "config",
  ],
  config: ["config"],
};

const PACKAGES: Record<Where, PackageRule[]> = {
  domain: [{ name: "zod", typeOnly: true }],
  application: [],
  infrastructure: [
    { name: "node:*" },
    { name: "zod", file: "src/infrastructure/rules-schema.ts" },
    { name: "eld", file: "src/infrastructure/eld-detector.ts" },
  ],
  presentation: [{ name: "@optimizely-opal/opal-tools-sdk" }, { name: "zod" }],
  main: [{ name: "*" }],
  api: [],
  "test-support": [{ name: "*" }],
  test: [{ name: "*" }],
  config: [],
};

const FROM = /\b(?:import|export)(\s+type)?\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g;
const BARE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export const whereIs = (path: string): Where | undefined =>
  PREFIXES.find(([prefix]) => path.startsWith(prefix))?.[1];

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"])\/\/.*$/gm, "$1");

const fromImports = (file: string, source: string): Import[] =>
  [...source.matchAll(FROM)].map((m) => ({ file, spec: m[2] ?? "", typeOnly: !!m[1] }));

const plainImports = (file: string, source: string): Import[] =>
  [...source.matchAll(BARE), ...source.matchAll(DYNAMIC)].map((m) => ({
    file,
    spec: m[1] ?? "",
    typeOnly: false,
  }));

function importsOf(file: string, text: string): Import[] {
  const source = stripComments(text);
  return [...fromImports(file, source), ...plainImports(file, source)];
}

const packageName = (spec: string): string =>
  spec
    .split("/")
    .slice(0, spec.startsWith("@") ? 2 : 1)
    .join("/");

function packageAllowed({ file, spec, typeOnly }: Import, rules: PackageRule[]): boolean {
  const name = isBuiltin(spec) ? "node:*" : packageName(spec);
  const hit = (r: PackageRule) => [name, "*"].includes(r.name) && (r.file ?? file) === file;
  return rules.some((r) => hit(r) && (typeOnly || !r.typeOnly));
}

function allowed(from: Where, imp: Import): boolean {
  if (!imp.spec.startsWith(".")) return packageAllowed(imp, PACKAGES[from]);
  const target = whereIs(posix.join(posix.dirname(imp.file), imp.spec));
  return target !== undefined && LAYERS[from].includes(target);
}

const violation = (from: Where, { file, spec }: Import): string =>
  `${file}: ${from} must not import ${spec}`;

function fileViolations(file: string, source: string): string[] {
  const from = whereIs(file);
  const bad = importsOf(file, source).filter((imp) => from && !allowed(from, imp));
  return from ? bad.map((imp) => violation(from, imp)) : [];
}

export const layerViolations = (files: Files): string[] =>
  Object.entries(files).flatMap(([file, source]) => fileViolations(file, source));
