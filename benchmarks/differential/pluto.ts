// Compares Evergreen's Kubernetes API findings with what Pluto reports for the same repository.
//
// Pluto is run by a maintainer, outside scans and CI:
//
//   pluto detect-files -d <checkout> -o json -t k8s=v1.36.0 > pluto.json
//   node dist/benchmarks/differential/pluto.js --pluto pluto.json --repository <checkout> [--name owner/repo] [--out report.json]
//
// Both tools read an `apiVersion` and a `kind` from a manifest and say whether the Kubernetes project still serves it.
// They are compared by file, kind, API group, and version. Pluto also reports versions that are deprecated but still
// served; Evergreen reports only removed ones, so those are counted apart and never as a disagreement. Pluto skips
// Helm templates it cannot parse, and Evergreen reads some of them, so a finding in a template can be Evergreen-only.

import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface PlutoItem {
  /** Repository-relative path with forward slashes. */
  path: string;
  kind: string;
  /** The `apiVersion` value, for example `extensions/v1beta1`. */
  version: string;
  deprecated: boolean;
  removed: boolean;
  removedIn: string;
  replacement: string;
}

export interface EvergreenFinding {
  ruleId: string;
  path: string;
  line?: number;
}

export interface Comparison {
  path: string;
  kind: string;
  version: string;
  evergreen: string[];
  /** What Pluto says: removed, deprecated (still served), or not-seen. */
  pluto: "removed" | "deprecated" | "not-seen";
  outcome: "agree" | "evergreen-only" | "pluto-only" | "pluto-deprecated-only";
  note: string;
}

interface RawItem {
  filePath?: string;
  api?: { version?: string; kind?: string; "removed-in"?: string; "replacement-api"?: string };
  deprecated?: boolean;
  removed?: boolean;
}

/** The items in `pluto detect-files -o json`, with paths relative to `root`. */
export function plutoItems(report: unknown, root: string): PlutoItem[] {
  const items = (report as { items?: RawItem[] }).items ?? [];
  const result: PlutoItem[] = [];
  for (const item of items) {
    if (!item.filePath || !item.api?.version || !item.api.kind) continue;
    const path = relative(root, item.filePath).split("\\").join("/");
    result.push({
      path,
      kind: item.api.kind,
      version: item.api.version,
      deprecated: item.deprecated === true,
      removed: item.removed === true,
      removedIn: item.api["removed-in"] ?? "",
      replacement: item.api["replacement-api"] ?? "",
    });
  }
  return result;
}

/** The kind and `group/version` an Evergreen Kubernetes rule is about, or undefined for any other rule. */
export function classify(finding: EvergreenFinding): { kind: string; version: string } | undefined {
  // kubernetes.<group, dots as dashes>.<kind, lowercase>.<version>.removed; the core and `extensions` groups have no dots.
  const parts = finding.ruleId.split(".");
  if (parts[0] !== "kubernetes" || parts.length !== 5 || parts[4] !== "removed") return undefined;
  return { kind: parts[2]!, version: `${parts[1]}/${parts[3]}` };
}

/** A key that treats `networking.k8s.io/v1beta1` and the rule's `networking-k8s-io/v1beta1` as the same version. */
const versionKey = (version: string): string => version.replace(/\./g, "-").toLowerCase();

export function compare(findings: readonly EvergreenFinding[], items: readonly PlutoItem[]): { comparisons: Comparison[]; notComparable: string[] } {
  const comparisons = new Map<string, Comparison>();
  const notComparable = new Set<string>();
  const keyOf = (path: string, kind: string, version: string) => [path, kind.toLowerCase(), versionKey(version)].join("\n");

  for (const finding of findings) {
    const about = classify(finding);
    if (!about) {
      notComparable.add(finding.ruleId.split(".").slice(0, 2).join("."));
      continue;
    }
    const key = keyOf(finding.path, about.kind, about.version);
    const existing = comparisons.get(key);
    if (existing) {
      if (!existing.evergreen.includes(finding.ruleId)) existing.evergreen.push(finding.ruleId);
      continue;
    }
    const seen = items.find((item) => keyOf(item.path, item.kind, item.version) === key);
    comparisons.set(key, {
      path: finding.path,
      kind: seen?.kind ?? about.kind,
      version: seen?.version ?? about.version,
      evergreen: [finding.ruleId],
      pluto: seen ? (seen.removed ? "removed" : "deprecated") : "not-seen",
      outcome: seen?.removed ? "agree" : "evergreen-only",
      note: seen?.removed
        ? "Both report the API version as removed."
        : seen
          ? "Pluto lists the API version as deprecated but still served at its target version."
          : "Pluto did not list this manifest (a Helm template or a form it does not parse).",
    });
  }

  for (const item of items) {
    const key = keyOf(item.path, item.kind, item.version);
    if (comparisons.has(key)) continue;
    comparisons.set(key, {
      path: item.path,
      kind: item.kind,
      version: item.version,
      evergreen: [],
      pluto: item.removed ? "removed" : "deprecated",
      outcome: item.removed ? "pluto-only" : "pluto-deprecated-only",
      note: item.removed ? "Pluto reports the API version as removed; Evergreen has no rule for this kind and version." : "Pluto reports a deprecated API version that is still served; Evergreen judges only removed ones.",
    });
  }

  for (const item of comparisons.values()) item.evergreen.sort();
  return {
    comparisons: [...comparisons.values()].sort((left, right) => [left.path, left.kind, left.version].join("\n").localeCompare([right.path, right.kind, right.version].join("\n"))),
    notComparable: [...notComparable].sort(),
  };
}

export interface DifferentialReport {
  schemaVersion: "evergreen.differential.pluto.v1";
  repository: string;
  summary: Record<Comparison["outcome"], number>;
  comparisons: Comparison[];
  notComparable: string[];
}

export function report(repository: string, findings: readonly EvergreenFinding[], items: readonly PlutoItem[]): DifferentialReport {
  const { comparisons, notComparable } = compare(findings, items);
  const summary = { agree: 0, "evergreen-only": 0, "pluto-only": 0, "pluto-deprecated-only": 0 };
  for (const item of comparisons) summary[item.outcome]++;
  return { schemaVersion: "evergreen.differential.pluto.v1", repository, summary, comparisons, notComparable };
}

export async function main(argv: string[]): Promise<number> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!;
    if (!["--pluto", "--repository", "--out", "--name"].includes(flag) || argv[index + 1] === undefined) throw new Error("Usage: pluto --pluto <report.json> --repository <checkout> [--name <label>] [--out <file>]");
    values.set(flag, argv[index + 1]!);
  }
  const reportPath = values.get("--pluto");
  const repository = values.get("--repository");
  if (!reportPath || !repository) throw new Error("--pluto and --repository are required.");
  const root = resolve(repository);
  const { scanRepository } = await import("../../src/engine.js");
  const { builtInDetectors } = await import("../../src/detectors/index.js");
  const scan = await scanRepository(root, builtInDetectors);
  const result = report(
    values.get("--name") ?? repository,
    scan.findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path, ...(finding.location.line === undefined ? {} : { line: finding.location.line }) })),
    plutoItems(JSON.parse(await readFile(reportPath, "utf8")), root),
  );
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (values.get("--out")) await writeFile(values.get("--out")!, text);
  else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}
