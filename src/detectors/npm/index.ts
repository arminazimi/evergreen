import { resolve } from "node:path";

import { DETECTOR_API_VERSION } from "../../sdk.js";
import type {
  Detector,
  DetectorAnalysis,
  DetectorContext,
  DetectorFinding,
  DetectorInputs,
  DetectorUnclassifiedReference,
} from "../../sdk.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { discoverNpmWorkspaces } from "../../workspaces.js";
import { collectLockData } from "./lockfiles/index.js";
import { binaryBunLockReference, loadNpmProject } from "./project.js";
import type { NpmProject } from "./project.js";
import { readOptional } from "./read-optional.js";
import { loadNodeRules, loadPackageRules, matchPackageRules, matchedRuleFinding } from "./rules.js";
import type { MatchedPackageRule } from "./rules.js";
import { runtimeFindings, runtimeRuleContext } from "./runtime.js";

/** Turns usage-analysis skip lines (`path: reason`) into unclassified references for the report. */
function unclassifiedFromUsageSkips(skips: readonly string[]): DetectorUnclassifiedReference[] {
  return skips.map((detail) => {
    const separator = detail.indexOf(": ");
    const path = separator === -1 ? detail : detail.slice(0, separator);
    return {
      component: "source-usage",
      reference: path || detail,
      reason: separator === -1 ? detail : detail.slice(separator + 2),
      location: { path: path || ".", line: 1 },
    };
  });
}

export class NpmDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "npm";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [
      "package.json",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      ".nvmrc",
      ".node-version",
      "pnpm-workspace.yaml",
      "lerna.json",
    ],
    sourceExtensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".json", ".yaml", ".yml"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const rootManifest = await readOptional(resolve(context.root, "package.json"));
    const workspaceDirectories = await discoverNpmWorkspaces(context.root);
    if (!rootManifest && workspaceDirectories.length === 0) return { findings: [], unclassified: [] };

    const unclassified: DetectorUnclassifiedReference[] = [];
    if ((await readOptional(resolve(context.root, "bun.lockb"))) !== undefined) {
      unclassified.push(binaryBunLockReference("bun.lockb"));
    }

    const [packageRules, nodeRules, rootLock] = await Promise.all([
      loadPackageRules(),
      loadNodeRules(),
      collectLockData(context.root),
    ]);

    const projects: NpmProject[] = [];
    for (const directory of ["", ...workspaceDirectories]) {
      const project = await loadNpmProject(context.root, directory, rootManifest, rootLock, unclassified);
      if (project) projects.push(project);
    }

    const findings: DetectorFinding[] = [];
    const matched: MatchedPackageRule[] = [];
    const runtime = runtimeRuleContext(nodeRules);
    const seenRuntimeRules = new Set<string>();
    for (const project of projects) {
      findings.push(...(await runtimeFindings(context.root, project, nodeRules, runtime, seenRuntimeRules)));
      matched.push(...matchPackageRules(project, packageRules));
    }

    const matchedRules = [...new Map(matched.map((item) => [item.rule.id, item.rule])).values()];
    const usageSkips: string[] = [];
    const usageAnalyses = await analyzeSourceUsage(
      context.root,
      matchedRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
      { skips: usageSkips },
    );
    unclassified.push(...unclassifiedFromUsageSkips(usageSkips));
    const usagesByRule = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis.usages]));
    const projectDirectories = projects.map((project) => project.directory);

    for (const item of matched) {
      findings.push(matchedRuleFinding(context.root, item, usagesByRule, projectDirectories));
    }
    return { findings, unclassified };
  }
}

export const npmDetector = new NpmDetector();
