// Fails on a new layer-boundary violation or import cycle in src/.
//
//   node dist/tools/check-architecture.js [--update-baseline]
//
// Boundaries follow the table in AGENTS.md. Findings that predate this check are listed in
// tools/architecture-baseline.json; the baseline may only shrink: a finding that is gone must be
// removed from it, and a new one fails the check. Offline: it reads source files only.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface BoundaryRule {
  id: string;
  /** Importing files: a path prefix (directory) or an exact path. */
  from: readonly string[];
  /** Forbidden targets or node: modules, as path prefixes. */
  to: readonly string[];
  why: string;
}

const ADAPTERS = [
  "src/cli.ts",
  "src/cli-main.ts",
  "src/mcp.ts",
  "src/mcp-cli.ts",
  "src/mcp-server.ts",
  "src/mcp-http.ts",
  "src/github-action.ts",
  "src/action.ts",
] as const;

export const RULES: readonly BoundaryRule[] = [
  {
    id: "engine-no-detectors",
    from: ["src/engine/", "src/domain.ts"],
    to: ["src/detectors/", "src/scan-builtins.ts"],
    why: "the scan engine must not import built-in detectors",
  },
  {
    id: "source-usage-no-detectors",
    from: ["src/source-usage.ts"],
    to: ["src/detectors/"],
    why: "source usage holds no detector-specific rules",
  },
  {
    id: "detectors-no-adapters",
    from: ["src/detectors/"],
    to: [...ADAPTERS],
    why: "detectors must not depend on a host adapter",
  },
  {
    id: "detectors-no-network",
    from: ["src/detectors/"],
    to: ["node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:dns"],
    why: "scans never use the network",
  },
  {
    id: "core-no-adapters",
    from: ["src/engine/", "src/domain.ts", "src/sdk.ts", "src/source-usage.ts"],
    to: [...ADAPTERS],
    why: "core layers must not import an adapter",
  },
  {
    id: "core-no-fs-or-network",
    from: [
      "src/domain.ts",
      "src/errors.ts",
      "src/paths.ts",
      "src/sdk.ts",
      "src/engine/",
      "src/source-usage.ts",
      "src/source-files.ts",
      "src/scan-cache.ts",
      "src/detector-inputs.ts",
      "src/file-system.ts",
      "src/usage/",
    ],
    to: [
      "node:fs",
      "node:fs/promises",
      "node:child_process",
      "node:http",
      "node:https",
      "node:net",
      "node:tls",
      "node:dgram",
      "node:dns",
    ],
    why: "domain, SDK, and core reach the filesystem through ScanFileSystem and never open a network connection (ADR 0031)",
  },
];

export interface Baseline {
  violations: string[];
  cycles: string[];
}

export interface Report {
  violations: string[];
  cycles: string[];
}

/** Module specifiers from static imports, re-exports, and dynamic `import("...")` calls. */
export function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

function matches(target: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? target.startsWith(p) : target === p));
}

/** Resolve a relative `.js` specifier to the `.ts` path it was compiled from. */
export function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("node:")) return spec;
  if (!spec.startsWith(".")) return null;
  const joined = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  return joined.replace(/\.js$/, ".ts");
}

export function buildGraph(files: ReadonlyMap<string, string>): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [file, source] of files) {
    const edges: string[] = [];
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(file, spec);
      if (target !== null) edges.push(target);
    }
    graph.set(file, [...new Set(edges)].sort());
  }
  return graph;
}

export function findViolations(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const out: string[] = [];
  for (const rule of RULES) {
    for (const [file, targets] of graph) {
      if (!matches(file, rule.from)) continue;
      for (const target of targets) {
        if (matches(target, rule.to)) out.push(`${rule.id}: ${file} -> ${target}`);
      }
    }
  }
  return out.sort();
}

/** Strongly connected components with more than one file (Tarjan), each as a sorted joined key. */
export function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[] = [];

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) cycles.push(component.sort().join(" <-> "));
    }
  };

  for (const node of [...graph.keys()].sort()) {
    if (!index.has(node)) visit(node);
  }
  return cycles.sort();
}

/** Findings the baseline does not cover (`added`) and baseline entries that no longer occur (`stale`). */
export function compare(current: Report, baseline: Baseline): { added: string[]; stale: string[] } {
  const added = [
    ...current.violations.filter((v) => !baseline.violations.includes(v)),
    ...current.cycles.filter((c) => !baseline.cycles.includes(`${c}`)).map((c) => `cycle: ${c}`),
  ];
  const stale = [
    ...baseline.violations.filter((v) => !current.violations.includes(v)),
    ...baseline.cycles.filter((c) => !current.cycles.includes(c)).map((c) => `cycle: ${c}`),
  ];
  return { added, stale };
}

function listSources(root: string, dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) listSources(root, path, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

export function loadSources(root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const path of listSources(root, "src").sort()) {
    files.set(path, readFileSync(join(root, path), "utf8"));
  }
  return files;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function parseBaseline(raw: unknown): Baseline {
  const get = (key: string): unknown => (typeof raw === "object" && raw !== null ? Reflect.get(raw, key) : undefined);
  return { violations: strings(get("violations")), cycles: strings(get("cycles")) };
}

export const BASELINE_PATH = "tools/architecture-baseline.json";

export function main(argv: readonly string[], root = process.cwd()): number {
  const graph = buildGraph(loadSources(root));
  const current: Report = { violations: findViolations(graph), cycles: findCycles(graph) };
  const baselineFile = join(root, BASELINE_PATH);
  if (argv.includes("--update-baseline")) {
    writeFileSync(baselineFile, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Wrote ${BASELINE_PATH}.`);
    return 0;
  }
  const baseline = parseBaseline(JSON.parse(readFileSync(baselineFile, "utf8")) as unknown);
  const { added, stale } = compare(current, baseline);
  for (const line of added) console.error(`new architecture violation: ${line}`);
  for (const line of stale) {
    console.error(`fixed but still in ${BASELINE_PATH}: ${line} (run with --update-baseline)`);
  }
  if (added.length > 0 || stale.length > 0) return 1;
  console.log(
    `Architecture OK: ${current.violations.length} baselined violations, ${current.cycles.length} baselined cycles.`,
  );
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
