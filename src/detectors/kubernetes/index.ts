import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "../../vers.js";
import { ruleVersion } from "./api-version.js";
import { parseTemplate } from "./parse-helm.js";
import { parseKustomization } from "./parse-kustomize.js";
import { MAXIMUM_INPUT_BYTES, parseManifest } from "./parse-manifest.js";
import type { ApiDeclaration } from "./parse-manifest.js";

/**
 * Finds Kubernetes API versions the Kubernetes project says are no longer served.
 *
 * It reads the literal `apiVersion` and `kind` of manifests, Helm chart templates, and
 * kustomization patches, and matches the pair to a rule by group and kind (decision 0008).
 * Nothing is rendered, built, or applied, and a declaration that depends on the cluster or on
 * Helm values is never reported.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const YAML_FILE = /\.ya?ml$/;
const KUSTOMIZATION_FILE = /^kustomization\.ya?ml$|^Kustomization$/;
const CHART_FILE = "Chart.yaml";
const PURL_PREFIX = "pkg:generic/kubernetes/";

type FileKind = "manifest" | "template" | "kustomization";

interface Candidate {
  file: string;
  kind: FileKind;
}

/** Find candidate files; a chart's `templates/` are Helm templates and its nested `charts/` are skipped. */
async function candidateFiles(root: string): Promise<Candidate[]> {
  const files: Candidate[] = [];

  async function entriesOf(directory: string) {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    const entries = await entriesOf(directory);
    const isChart = entries.some((entry) => entry.isFile() && entry.name === CHART_FILE);

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        if (isChart && entry.name === "charts") continue;
        if (isChart && entry.name === "templates") await templates(path, depth + 1);
        else await walk(path, depth + 1);
      } else if (entry.isFile()) {
        if (isChart && (entry.name === CHART_FILE || entry.name === "Chart.lock")) continue;
        if (KUSTOMIZATION_FILE.test(entry.name)) files.push({ file: path, kind: "kustomization" });
        else if (YAML_FILE.test(entry.name)) files.push({ file: path, kind: "manifest" });
      }
    }
  }

  // Only the YAML files directly in `templates/`; subdirectories such as `tests/` are not read.
  async function templates(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH) return;
    for (const entry of await entriesOf(directory)) {
      if (entry.isFile() && !entry.isSymbolicLink() && YAML_FILE.test(entry.name) && files.length < MAXIMUM_FILES) {
        files.push({ file: join(directory, entry.name), kind: "template" });
      }
    }
  }

  await walk(root, 0);
  return files;
}

interface Located {
  path: string;
  declaration: ApiDeclaration;
}

async function declarations(root: string): Promise<Located[]> {
  const result: Located[] = [];
  for (const { file, kind } of await candidateFiles(root)) {
    let contents: string;
    try {
      if ((await stat(file)).size > MAXIMUM_INPUT_BYTES) continue;
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // Every declaration needs the key; this skips the parse for the many YAML files that have none.
    if (kind !== "kustomization" && !contents.includes("apiVersion")) continue;
    const path = relativePosix(root, file);
    // A file with template actions is read as a template even outside a chart, so a declaration
    // guarded by a cluster check is not mistaken for a plain manifest.
    const found =
      kind === "kustomization"
        ? parseKustomization(contents).filter((entry): entry is ApiDeclaration => entry.kind === "api")
        : kind === "template" || contents.includes("{{")
          ? parseTemplate(contents)
          : parseManifest(contents);
    for (const declaration of found) result.push({ path, declaration });
  }
  return result;
}

function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const map = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) map.set(rule.purl, [...(map.get(rule.purl) ?? []), rule]);
  return map;
}

export class KubernetesDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "kubernetes";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: ["Kustomization"], extensions: [".yaml", ".yml"] };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const found = await declarations(context.root);
    if (found.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/kubernetes.json"));
    const rules = rulesByPurl(registry.rules);
    const findings: DetectorFinding[] = [];

    for (const { path, declaration } of found) {
      // The core group (no slash) has no removed kinds in the migration guide.
      if (declaration.group === "") continue;
      const candidates = rules.get(`${PURL_PREFIX}${declaration.group}/${declaration.resource}`);
      const version = ruleVersion(declaration.version);
      if (!candidates || !version) continue;

      const rule = candidates.find((item) => versContains(item.vers, version));
      if (!rule) continue;
      findings.push({
        id: `${rule.id}:${path}:${declaration.line}`,
        ruleId: rule.id,
        title: rule.title,
        summary: `${path} declares ${declaration.value} ${declaration.resource}. ${rule.summary}`,
        severity: rule.severity,
        location: { path, line: declaration.line },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    }

    return { findings, unclassified: [] };
  }
}

export const kubernetesDetector = new KubernetesDetector();
