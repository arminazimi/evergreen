import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "../../vers/index.js";
import { parseServerlessYml } from "./parse-serverless-yml.js";
import type { RuntimeDeclaration } from "./parse-serverless-yml.js";
import { parseTemplate } from "./parse-template.js";
import { parseTf } from "./parse-tf.js";

/**
 * Serverless runtime lifecycle detector.
 *
 * It reads AWS SAM / CloudFormation `template.yaml` / `template.yml`, Serverless Framework
 * `serverless.yml`, and Terraform `*.tf` files, and matches each literal runtime identifier against
 * the rules whose Package URL embeds that identifier (`pkg:generic/aws-lambda-runtime/<id>` or
 * `pkg:generic/google-cloud-functions-runtime/<id>`). The first rule whose VERS range contains the
 * identifier wins. A rule whose VERS is malformed is skipped so it cannot hide a later rule. Cloud
 * tools are never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const TEMPLATE_NAMES = new Set(["template.yaml", "template.yml"]);
const SERVERLESS_YML = "serverless.yml";
const AWS_PURL_PREFIX = "pkg:generic/aws-lambda-runtime/";
const GCLOUD_PURL_PREFIX = "pkg:generic/google-cloud-functions-runtime/";

type ServerlessFileKind = "template" | "serverless-yml" | "tf";

interface ServerlessFile {
  path: string;
  kind: ServerlessFileKind;
}

async function serverlessFiles(root: string): Promise<ServerlessFile[]> {
  const files: ServerlessFile[] = [];
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
        continue;
      }
      if (!entry.isFile()) continue;
      const name = entry.name;
      const lower = name.toLowerCase();
      if (TEMPLATE_NAMES.has(lower)) files.push({ path: join(directory, name), kind: "template" });
      else if (lower === SERVERLESS_YML) files.push({ path: join(directory, name), kind: "serverless-yml" });
      else if (lower.endsWith(".tf")) files.push({ path: join(directory, name), kind: "tf" });
    }
  }
  await walk(root, 0);
  return files;
}

function parseFile(kind: ServerlessFileKind, contents: string): RuntimeDeclaration[] {
  if (kind === "template") return parseTemplate(contents);
  if (kind === "serverless-yml") return parseServerlessYml(contents);
  return parseTf(contents);
}

/** Candidate Package URLs for a runtime identifier as written in the declaration. */
export function candidatePurls(identifier: string): string[] {
  return [`${AWS_PURL_PREFIX}${identifier}`, `${GCLOUD_PURL_PREFIX}${identifier}`];
}

/** The first rule whose VERS range contains the version. A rule that cannot be compared is skipped. */
function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    const existing = grouped.get(rule.purl);
    if (existing) existing.push(rule);
    else grouped.set(rule.purl, [rule]);
  }
  return grouped;
}

export class ServerlessDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "serverless";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["template.yaml", "template.yml", "serverless.yml"],
    extensions: [".tf"],
  };

  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/serverless.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await serverlessFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const findings: DetectorFinding[] = [];

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
      for (const declaration of parseFile(file.kind, contents)) {
        let matched: RegistryV2Rule | undefined;
        for (const purl of candidatePurls(declaration.value)) {
          matched = firstMatchingRule(byPurl.get(purl) ?? [], declaration.value);
          if (matched) break;
        }
        if (!matched) continue;
        report(matched, path, declaration.line, `${path} declares runtime ${declaration.value}. ${matched.summary}`);
      }
    }

    findings.sort((left, right) => left.location.path.localeCompare(right.location.path) || (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id));
    return { findings, unclassified: [] };
  }
}

export const serverlessDetector = new ServerlessDetector();
