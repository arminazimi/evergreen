// Compares Evergreen's findings with what Renovate reports for the same repository, by rule family.
//
// Renovate is run by a maintainer, outside scans and CI (it needs the network and a large download):
//
//   npx renovate --platform=local --dry-run=lookup --report-type=file --report-path=renovate.json
//   node dist/benchmarks/differential/renovate.js --renovate renovate.json --repository <checkout> [--out report.json]
//
// Renovate has no lifecycle data: it reports updates that exist and npm deprecation notices. The families
// below are the places where the two tools can say something about the same dependency. Evergreen has no
// answer for "an update exists", and Renovate has none for "this release line is end-of-life", so those
// disagreements are expected; the report keeps them apart from the ones that are not.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Family = "deprecated-package" | "base-image" | "github-action";

export interface RenovateDependency {
  manager: string;
  path: string;
  name: string;
  currentValue?: string;
  /** Renovate printed a deprecation notice for the package. */
  deprecated: boolean;
  /** Why Renovate did not look the dependency up (for example `github-token-required`). */
  skipReason?: string;
  /** A newer major version exists. */
  majorUpdate: boolean;
  /** Any newer version exists. */
  anyUpdate: boolean;
}

export interface EvergreenFinding {
  ruleId: string;
  path: string;
  line?: number;
}

export interface Comparison {
  family: Family;
  path: string;
  name: string;
  evergreen: string[];
  renovate: "deprecated" | "major-update" | "update" | "none" | "not-seen" | "skipped";
  outcome: "agree" | "evergreen-only" | "renovate-only" | "inconclusive";
  note: string;
}

const MANAGER_FAMILY: Record<string, Family> = {
  npm: "deprecated-package",
  dockerfile: "base-image",
  "docker-compose": "base-image",
  "github-actions": "github-action",
};

interface RawReport {
  repositories?: Record<string, { packageFiles?: Record<string, Array<{ packageFile?: string; deps?: Array<Record<string, unknown>> }>> }>;
}

/** The dependencies in a Renovate `--report-type=file` report, reduced to what the comparison reads. */
export function renovateDependencies(report: unknown): RenovateDependency[] {
  const result: RenovateDependency[] = [];
  for (const repository of Object.values((report as RawReport).repositories ?? {})) {
    for (const [manager, files] of Object.entries(repository.packageFiles ?? {})) {
      if (!MANAGER_FAMILY[manager]) continue;
      for (const file of files) {
        for (const dep of file.deps ?? []) {
          const name = typeof dep.depName === "string" ? dep.depName : undefined;
          if (!name || typeof file.packageFile !== "string") continue;
          const updates = Array.isArray(dep.updates) ? (dep.updates as Array<{ updateType?: string }>) : [];
          result.push({
            manager,
            path: file.packageFile,
            name,
            ...(typeof dep.currentValue === "string" ? { currentValue: dep.currentValue } : {}),
            ...(typeof dep.skipReason === "string" ? { skipReason: dep.skipReason } : {}),
            deprecated: typeof dep.deprecationMessage === "string" && dep.deprecationMessage.length > 0,
            majorUpdate: updates.some((update) => update.updateType === "major"),
            anyUpdate: updates.length > 0,
          });
        }
      }
    }
  }
  return result;
}

/** The family and dependency name an Evergreen finding is about, or undefined when Renovate cannot speak to it. */
export function classify(finding: EvergreenFinding): { family: Family; name: string } | undefined {
  const parts = finding.ruleId.split(".");
  if (parts[0] === "npm" && parts[1] === "package" && parts.length >= 4) return { family: "deprecated-package", name: parts.slice(2, -1).join(".") };
  if (parts[0] === "container" && parts[1]) return { family: "base-image", name: parts[1] };
  if (parts[0] === "github-actions" && parts[1]) return { family: "github-action", name: parts[1] };
  return undefined;
}

const normalize = (name: string) => name.toLowerCase().replace(/^@/, "").replace(/\//g, "-");
const tail = (name: string) => name.split("/").pop()!.toLowerCase();

/** Does a Renovate dependency name refer to the dependency a rule is about? */
function sameDependency(family: Family, ruleName: string, renovateName: string): boolean {
  if (family === "deprecated-package") return normalize(renovateName) === normalize(ruleName);
  if (family === "github-action") return tail(renovateName) === ruleName.toLowerCase();
  // Images: rule names are repository names ("postgres", "node"); Renovate uses the image name.
  return tail(renovateName) === ruleName.toLowerCase();
}

const CONTAINER_LIKE: Record<Family, string> = {
  "deprecated-package": "npm package",
  "base-image": "base image",
  "github-action": "GitHub Action",
};

export function compare(findings: readonly EvergreenFinding[], dependencies: readonly RenovateDependency[]): { comparisons: Comparison[]; notComparable: string[] } {
  const comparisons = new Map<string, Comparison>();
  const notComparable = new Set<string>();

  for (const finding of findings) {
    const about = classify(finding);
    if (!about) {
      notComparable.add(finding.ruleId.split(".").slice(0, 2).join("."));
      continue;
    }
    const key = [about.family, finding.path, about.name].join("\n");
    const existing = comparisons.get(key);
    if (existing) {
      if (!existing.evergreen.includes(finding.ruleId)) existing.evergreen.push(finding.ruleId);
      continue;
    }
    const seen = dependencies.filter((dep) => MANAGER_FAMILY[dep.manager] === about.family && dep.path === finding.path && sameDependency(about.family, about.name, dep.name));
    const renovate: Comparison["renovate"] = seen.some((dep) => dep.deprecated)
      ? "deprecated"
      : seen.length > 0 && seen.every((dep) => dep.skipReason !== undefined)
        ? "skipped"
      : seen.some((dep) => dep.majorUpdate)
        ? "major-update"
        : seen.some((dep) => dep.anyUpdate)
          ? "update"
          : seen.length > 0
            ? "none"
            : "not-seen";
    const skipped = renovate === "skipped";
    const flagged = about.family === "deprecated-package" ? renovate === "deprecated" : renovate === "major-update" || renovate === "update";
    comparisons.set(key, {
      family: about.family,
      path: finding.path,
      name: about.name,
      evergreen: [finding.ruleId],
      renovate,
      outcome: skipped ? "inconclusive" : flagged ? "agree" : "evergreen-only",
      note: skipped
        ? `Renovate did not look this ${CONTAINER_LIKE[about.family]} up (${seen.find((dep) => dep.skipReason)?.skipReason}), so it says nothing either way.`
        : flagged
        ? about.family === "deprecated-package"
          ? "Both report the package as deprecated."
          : `Evergreen says the ${CONTAINER_LIKE[about.family]} is past end of life; Renovate offers an update. Renovate does not say the old line is unsupported.`
        : renovate === "not-seen"
          ? `Renovate did not list this ${CONTAINER_LIKE[about.family]} at all.`
          : about.family === "deprecated-package"
            ? "Renovate lists the package but prints no deprecation notice."
            : `Renovate lists the ${CONTAINER_LIKE[about.family]} but offers no update.`,
    });
  }

  // What only Renovate says: a deprecation notice Evergreen has no finding for.
  for (const dep of dependencies) {
    if (!dep.deprecated || MANAGER_FAMILY[dep.manager] !== "deprecated-package") continue;
    const covered = [...comparisons.values()].some((item) => item.family === "deprecated-package" && item.path === dep.path && sameDependency("deprecated-package", item.name, dep.name));
    if (!covered) {
      comparisons.set(["deprecated-package", dep.path, dep.name, "renovate"].join("\n"), {
        family: "deprecated-package",
        path: dep.path,
        name: dep.name,
        evergreen: [],
        renovate: "deprecated",
        outcome: "renovate-only",
        note: "Renovate prints a deprecation notice; Evergreen has no rule for this package.",
      });
    }
  }

  return {
    comparisons: [...comparisons.values()].sort((left, right) => [left.family, left.path, left.name].join("\n").localeCompare([right.family, right.path, right.name].join("\n"))),
    notComparable: [...notComparable].sort(),
  };
}

export interface DifferentialReport {
  schemaVersion: "evergreen.differential.renovate.v1";
  repository: string;
  summary: Record<Comparison["outcome"], number>;
  comparisons: Comparison[];
  notComparable: string[];
}

export function report(repository: string, findings: readonly EvergreenFinding[], dependencies: readonly RenovateDependency[]): DifferentialReport {
  const { comparisons, notComparable } = compare(findings, dependencies);
  const summary = { agree: 0, "evergreen-only": 0, "renovate-only": 0, inconclusive: 0 };
  for (const item of comparisons) summary[item.outcome]++;
  return { schemaVersion: "evergreen.differential.renovate.v1", repository, summary, comparisons, notComparable };
}

export async function main(argv: string[]): Promise<number> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!;
    if (!["--renovate", "--repository", "--out", "--name"].includes(flag) || argv[index + 1] === undefined) throw new Error("Usage: renovate --renovate <report.json> --repository <checkout> [--name <label>] [--out <file>]");
    values.set(flag, argv[index + 1]!);
  }
  const reportPath = values.get("--renovate");
  const repository = values.get("--repository");
  if (!reportPath || !repository) throw new Error("--renovate and --repository are required.");
  const { scanRepository } = await import("../../src/engine.js");
  const { builtInDetectors } = await import("../../src/detectors/index.js");
  const scan = await scanRepository(resolve(repository), builtInDetectors);
  const result = report(
    values.get("--name") ?? repository,
    scan.findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path, ...(finding.location.line === undefined ? {} : { line: finding.location.line }) })),
    renovateDependencies(JSON.parse(await readFile(reportPath, "utf8"))),
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
