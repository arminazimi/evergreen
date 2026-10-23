// Compares Evergreen's findings with what xeol reports for the same repository, by product.
//
// xeol is run by a maintainer, outside scans and CI (it downloads an EOL database):
//
//   xeol dir:<checkout> -o json > xeol.json
//   node dist/benchmarks/differential/xeol.js --xeol xeol.json --repository <checkout> [--name owner/repo] [--out report.json]
//
// xeol reports a release cycle of a product (a runtime, a database, an npm package) that endoflife.date lists
// as past its end of life, for a version it found in a lockfile or an image filesystem. Evergreen reports a
// release line that a vendor source says is past end of life, at the line of the file that declares it. The two
// are compared by product, because xeol names the lockfile that resolved the version and Evergreen names the
// manifest that declares it. Evergreen families xeol has no product for (GitHub Actions, CI images, platform
// minimums) are listed as not comparable, never as disagreements.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface XeolEol {
  /** The endoflife.date product name, for example `nodejs` or `postgresql`. */
  product: string;
  /** The release cycle xeol matched, for example `13` or `3.2`. */
  cycle: string;
  /** The version xeol found. */
  version: string;
  /** The package type xeol found it in, for example `npm`. */
  type: string;
  /** The end-of-life date xeol cites. */
  eol: string;
  /** Where xeol found it, without a leading slash. */
  path: string;
}

export interface EvergreenFinding {
  ruleId: string;
  path: string;
  line?: number;
}

export interface Comparison {
  product: string;
  /** The Evergreen rule ids about the product; empty when only xeol reports it. */
  evergreen: string[];
  /** The xeol cycles for the product; empty when only Evergreen reports it. */
  xeol: Array<{ cycle: string; version: string; eol: string; path: string }>;
  outcome: "agree" | "evergreen-only" | "xeol-only";
  note: string;
}

/** The xeol (endoflife.date) names an Evergreen product can appear under. The first entry is the display name. */
const XEOL_NAMES: Record<string, string[]> = {
  nodejs: ["nodejs"],
  python: ["python"],
  go: ["go"],
  ruby: ["ruby"],
  php: ["php"],
  rust: ["rust"],
  dotnet: ["dotnet", "dotnetcore"],
  java: ["java", "openjdk", "oracle-jdk", "eclipse-temurin", "amazon-corretto"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  mariadb: ["mariadb"],
  redis: ["redis"],
  mongodb: ["mongodb"],
  nginx: ["nginx"],
};

/** Container image repository names that are a product under another name. */
const IMAGE_PRODUCT: Record<string, string> = { node: "nodejs", golang: "go", postgres: "postgresql", openjdk: "java", eclipse_temurin: "java" };

/** Evergreen detectors whose rules are about a runtime, and the product each one reads. */
const RUNTIME_DETECTORS = new Set(["nodejs", "python", "go", "ruby", "php", "rust", "dotnet", "java"]);

interface RawMatch {
  Cycle?: { ProductName?: string; ReleaseCycle?: string; Eol?: string };
  artifact?: { name?: string; version?: string; type?: string; locations?: Array<{ path?: string }> };
}

/** The end-of-life matches in `xeol -o json`, reduced to what the comparison reads. */
export function xeolMatches(report: unknown): XeolEol[] {
  const matches = (report as { matches?: RawMatch[] }).matches ?? [];
  const result: XeolEol[] = [];
  for (const match of matches) {
    const product = match.Cycle?.ProductName;
    if (!product) continue;
    result.push({
      product,
      cycle: match.Cycle?.ReleaseCycle ?? "",
      version: match.artifact?.version ?? "",
      type: match.artifact?.type ?? "",
      eol: match.Cycle?.Eol ?? "",
      path: (match.artifact?.locations?.[0]?.path ?? "").replace(/^\/+/, ""),
    });
  }
  return result;
}

/** The product an Evergreen finding is about, or undefined when xeol has no product for it. */
export function classify(finding: EvergreenFinding): string | undefined {
  const parts = finding.ruleId.split(".");
  const detector = parts[0];
  if (detector && RUNTIME_DETECTORS.has(detector)) return detector;
  if (detector === "container" && parts[1]) return IMAGE_PRODUCT[parts[1]] ?? parts[1];
  if (detector === "npm" && parts[1] === "package" && parts.length >= 4) {
    // `npm.package.next.13.support-end` is about the release line 13 of `next`.
    const name = parts.slice(2, -1);
    while (name.length > 1 && /^\d+$/.test(name[name.length - 1]!)) name.pop();
    return name.join(".");
  }
  return undefined;
}

const namesFor = (product: string): string[] => XEOL_NAMES[product] ?? [product];

export function compare(findings: readonly EvergreenFinding[], matches: readonly XeolEol[]): { comparisons: Comparison[]; notComparable: string[] } {
  const comparisons = new Map<string, Comparison>();
  const notComparable = new Set<string>();
  const claimed = new Set<XeolEol>();

  for (const finding of findings) {
    const product = classify(finding);
    if (!product) {
      notComparable.add(finding.ruleId.split(".").slice(0, 2).join("."));
      continue;
    }
    const existing = comparisons.get(product);
    if (existing) {
      if (!existing.evergreen.includes(finding.ruleId)) existing.evergreen.push(finding.ruleId);
      continue;
    }
    const names = namesFor(product);
    const seen = matches.filter((match) => names.includes(match.product));
    for (const match of seen) claimed.add(match);
    comparisons.set(product, {
      product,
      evergreen: [finding.ruleId],
      xeol: seen.map(({ cycle, version, eol, path }) => ({ cycle, version, eol, path })),
      outcome: seen.length > 0 ? "agree" : "evergreen-only",
      note: seen.length > 0 ? "Both report a release of this product as past end of life." : "xeol reports nothing for this product; it did not read the file Evergreen read, or its database has no entry.",
    });
  }

  for (const match of matches) {
    if (claimed.has(match)) continue;
    const existing = comparisons.get(match.product);
    if (existing) {
      existing.xeol.push({ cycle: match.cycle, version: match.version, eol: match.eol, path: match.path });
      continue;
    }
    comparisons.set(match.product, {
      product: match.product,
      evergreen: [],
      xeol: [{ cycle: match.cycle, version: match.version, eol: match.eol, path: match.path }],
      outcome: "xeol-only",
      note: "xeol reports a release of this product as past end of life; Evergreen has no rule for it.",
    });
  }

  for (const item of comparisons.values()) item.evergreen.sort();
  for (const item of comparisons.values()) item.xeol.sort((left, right) => [left.cycle, left.version, left.path].join("\n").localeCompare([right.cycle, right.version, right.path].join("\n")));
  return {
    comparisons: [...comparisons.values()].sort((left, right) => left.product.localeCompare(right.product)),
    notComparable: [...notComparable].sort(),
  };
}

export interface DifferentialReport {
  schemaVersion: "evergreen.differential.xeol.v1";
  repository: string;
  summary: Record<Comparison["outcome"], number>;
  comparisons: Comparison[];
  notComparable: string[];
}

export function report(repository: string, findings: readonly EvergreenFinding[], matches: readonly XeolEol[]): DifferentialReport {
  const { comparisons, notComparable } = compare(findings, matches);
  const summary = { agree: 0, "evergreen-only": 0, "xeol-only": 0 };
  for (const item of comparisons) summary[item.outcome]++;
  return { schemaVersion: "evergreen.differential.xeol.v1", repository, summary, comparisons, notComparable };
}

export async function main(argv: string[]): Promise<number> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!;
    if (!["--xeol", "--repository", "--out", "--name"].includes(flag) || argv[index + 1] === undefined) throw new Error("Usage: xeol --xeol <report.json> --repository <checkout> [--name <label>] [--out <file>]");
    values.set(flag, argv[index + 1]!);
  }
  const reportPath = values.get("--xeol");
  const repository = values.get("--repository");
  if (!reportPath || !repository) throw new Error("--xeol and --repository are required.");
  const { scanRepository } = await import("../../src/engine.js");
  const { builtInDetectors } = await import("../../src/detectors/index.js");
  const scan = await scanRepository(resolve(repository), builtInDetectors);
  const result = report(
    values.get("--name") ?? repository,
    scan.findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path, ...(finding.location.line === undefined ? {} : { line: finding.location.line }) })),
    xeolMatches(JSON.parse(await readFile(reportPath, "utf8"))),
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
