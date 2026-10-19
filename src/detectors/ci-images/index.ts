import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../../sdk.js";
import { versContains } from "../../vers/index.js";
import { parseAzurePipelines } from "./parse-azure-pipelines.js";
import { parseCircleci } from "./parse-circleci.js";
import { parseGitlabCi } from "./parse-gitlab-ci.js";

/**
 * CI runner image lifecycle detector (decision 0014).
 *
 * GitLab image and service references are always unclassified; CircleCI local images are parsed but not matched
 * yet because decision 0014 defines no CircleCI PURL/version mapping and the registry has no CircleCI rules.
 * Azure `pool.vmImage` labels are normalized to `pkg:generic/azure-pipelines/<family>-image` + an intdot version
 * and matched against the registry. Nothing is fetched and no CI tool is run.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "bin", "obj", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);

type CiImageFileKind = "gitlab" | "circleci" | "azure";
interface CiImageFile {
  path: string;
  name: CiImageFileKind;
}

async function ciImageFiles(root: string): Promise<CiImageFile[]> {
  const files: CiImageFile[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const name = entry.name;
        if (name === ".gitlab-ci.yml") files.push({ path: join(directory, name), name: "gitlab" });
        else if (name === "azure-pipelines.yml") files.push({ path: join(directory, name), name: "azure" });
        else if (name === "config.yml" && basename(directory) === ".circleci") files.push({ path: join(directory, name), name: "circleci" });
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** `ubuntu-22.04` → `pkg:generic/azure-pipelines/ubuntu-image` + `22.04`; undefined for labels with no family. */
function azureNormalize(label: string): { purl: string; version: string } | undefined {
  const match = /^(ubuntu|macos|windows)-([\d.]+)$/.exec(label);
  if (!match) return undefined;
  return { purl: `pkg:generic/azure-pipelines/${match[1]!}-image`, version: match[2]! };
}

export class CiImagesDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "ci-images";

  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/ci-images.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await ciImageFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = await this.loadRules();
    const rulesByPurl = new Map<string, RegistryV2Rule[]>();
    for (const rule of rules) {
      const existing = rulesByPurl.get(rule.purl);
      if (existing) existing.push(rule);
      else rulesByPurl.set(rule.purl, [rule]);
    }

    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];

    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      findings.push({
        id: `${rule.id}:${path}:${line}`,
        ruleId: rule.id,
        title: rule.title,
        summary,
        severity: rule.severity,
        location: { path, line },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    };

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file.path, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file.path);

      if (file.name === "gitlab") {
        for (const item of parseGitlabCi(contents).unclassified) {
          unclassified.push({ component: "gitlab-ci-image", reference: item.value, reason: item.reason, location: { path, line: item.line } });
        }
      } else if (file.name === "circleci") {
        for (const item of parseCircleci(contents).unclassified) {
          unclassified.push({ component: "circleci-image", reference: item.value, reason: item.reason, location: { path, line: item.line } });
        }
      } else {
        const azure = parseAzurePipelines(contents);
        for (const declaration of azure.declarations) {
          const normalized = azureNormalize(declaration.value);
          if (!normalized) continue;
          for (const rule of rulesByPurl.get(normalized.purl) ?? []) {
            if (versContains(rule.vers, normalized.version)) {
              report(rule, path, declaration.line, `${path} uses vmImage ${declaration.value}. ${rule.summary}`);
            }
          }
        }
        for (const item of azure.unclassified) {
          unclassified.push({ component: "azure-pipelines-image", reference: item.value, reason: item.reason, location: { path, line: item.line } });
        }
      }
    }

    findings.sort((left, right) => left.location.path.localeCompare(right.location.path) || (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id));
    return { findings, unclassified };
  }
}

export const ciImagesDetector = new CiImagesDetector();
