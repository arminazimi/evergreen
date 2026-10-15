import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type {
  DeprecationRule,
} from "../domain.js";
import { findPackageFile } from "../package-files.js";
import {
  DETECTOR_API_VERSION,
  isDeprecationRule,
} from "../sdk.js";
import { loadRegistryRules } from "../registry.js";
import type { Detector, DetectorContext, DetectorFinding } from "../sdk.js";

interface GitHubActionRule extends DeprecationRule {
  action: string;
  supportedFromMajor: number;
}

interface ActionReference {
  action: string;
  ref: string;
  line: number;
}

const USES_PATTERN = /^\s*(?:-\s*)?uses\s*:\s*["']?([^\s#"']+)["']?(?:\s+#.*)?$/;
const VERSION_PATTERN = /^v?(\d+)(?:\.\d+){0,2}$/;

async function loadRegistry(): Promise<GitHubActionRule[]> {
  const registryPath = await findPackageFile("registry/github-actions.json", import.meta.url);
  const contents = await readFile(registryPath, "utf8");
  const registry = loadRegistryRules(JSON.parse(contents) as unknown, {
    schemaVersion: "evergreen.github-actions-registry.v1",
    isRule: (value): value is GitHubActionRule =>
      isDeprecationRule(value) &&
      typeof (value as Partial<GitHubActionRule>).action === "string" &&
      typeof (value as Partial<GitHubActionRule>).supportedFromMajor === "number",
  });
  return [...registry.rules];
}

async function findWorkflowFiles(root: string): Promise<string[]> {
  const workflowDirectory = resolve(root, ".github", "workflows");

  try {
    const entries = await readdir(workflowDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => resolve(workflowDirectory, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseActionReferences(contents: string): ActionReference[] {
  const references: ActionReference[] = [];

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const match = USES_PATTERN.exec(line);
    const target = match?.[1];
    if (!target || target.startsWith("./") || target.startsWith("docker://")) {
      continue;
    }

    const separator = target.lastIndexOf("@");
    if (separator <= 0 || separator === target.length - 1) {
      continue;
    }

    references.push({
      action: target.slice(0, separator).toLowerCase(),
      ref: target.slice(separator + 1),
      line: index + 1,
    });
  }

  return references;
}

function majorVersion(ref: string): number | undefined {
  const match = VERSION_PATTERN.exec(ref);
  const value = match?.[1];
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

export class GitHubActionsDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "github-actions";

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const [rules, workflowFiles] = await Promise.all([
      loadRegistry(),
      findWorkflowFiles(context.root),
    ]);
    const rulesByAction = new Map(rules.map((rule) => [rule.action.toLowerCase(), rule]));
    const findings: DetectorFinding[] = [];

    for (const workflowFile of workflowFiles) {
      const contents = await readFile(workflowFile, "utf8");

      for (const reference of parseActionReferences(contents)) {
        const rule = rulesByAction.get(reference.action);
        const major = majorVersion(reference.ref);
        if (!rule || major === undefined || major >= rule.supportedFromMajor) {
          continue;
        }

        const path = relative(context.root, workflowFile);
        findings.push({
          id: `${rule.id}:${path}:${reference.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary: `${reference.action}@${reference.ref}: ${rule.summary}`,
          severity: rule.severity,
          location: { path, line: reference.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
        });
      }
    }

    return findings;
  }
}

export const githubActionsDetector = new GitHubActionsDetector();
