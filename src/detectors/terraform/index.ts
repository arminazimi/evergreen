import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs, DetectorUnclassifiedReference } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseManagedKubernetes } from "./kubernetes.js";
import type { ManagedKubernetesProduct } from "./kubernetes.js";
import { parseTerraformLock } from "./parse-lock.js";
import { parseTerraformFile } from "./parse-terraform.js";
import { parseTerraformPlanJson } from "./plan.js";
import { parseTerraformVersionFile, parseToolVersionsTerraform } from "./parse-version-files.js";

/**
 * Terraform lifecycle detector.
 *
 * It reads `required_version` and `required_providers` constraints in `*.tf` files, the locked provider
 * versions in `.terraform.lock.hcl`, and the Terraform CLI version pinned in `.terraform-version` and the
 * `terraform` entry of `.tool-versions`. A CLI declaration is matched against rules for `pkg:generic/terraform`.
 * A provider is matched against rules for `pkg:generic/terraform-provider/<namespace>/<name>`; a provider on
 * `registry.terraform.io` is the only one read, and a `required_providers` entry without `source` is
 * `hashicorp/<name>`.
 *
 * A version that is exact (a lock entry, a version file, or a constraint written as `X.Y.Z` or `= X.Y.Z`) is
 * matched against the first rule whose VERS range contains it. A pessimistic `~> X.Y.Z` constraint admits only
 * the rest of one minor line, so it matches a rule that contains both ends of that line. Any other constraint
 * (`>= 1.5`, `~> 1.9`, a range) admits versions outside any single release line, so it is only matched against
 * a rule that covers every version. A rule whose VERS is malformed never matches and does not hide a later rule.
 *
 * It also reads the managed Kubernetes control-plane version: `cluster_version` in a module block (EKS),
 * `kubernetes_version` on `azurerm_kubernetes_cluster` or in a module block (AKS), and `min_master_version` on
 * `google_container_cluster` or in a module block (GKE). A partial version such as `1.33` is matched as the
 * whole minor line. A value that is a variable, local, or module reference, an interpolation, or otherwise not
 * one plain literal is listed as unclassified rather than guessed. Terraform is never run and nothing is
 * fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const MAXIMUM_PLAN_FILES = 50;
const SKIPPED_DIRECTORIES = new Set([".git", ".terraform", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const VERSION_FILES = new Set([".terraform-version", ".tool-versions", ".terraform.lock.hcl"]);
const TERRAFORM_PURL = "pkg:generic/terraform";
const REGISTRY_HOST = "registry.terraform.io";
const EXACT_VERSION = /^=?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const PESSIMISTIC_PATCH = /^~>\s*(\d+)\.(\d+)\.(\d+)$/;
/** A major, major.minor, or major.minor.patch release with an optional prerelease suffix. */
const PARTIAL_VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z][0-9A-Za-z._-]*)?$/;
const OPEN_END = "999999999";

/** The Package URL of each database engine product as written in `registry/database.json`. */
const ENGINE_PURLS: Readonly<Record<string, string>> = {
  postgres: "pkg:generic/postgresql",
  postgresql: "pkg:generic/postgresql",
  mysql: "pkg:generic/mysql",
  mariadb: "pkg:generic/mariadb",
  redis: "pkg:generic/redis",
  mongo: "pkg:generic/mongodb",
  mongodb: "pkg:generic/mongodb",
};

/** The Package URL of each managed Kubernetes product as written in `registry/terraform.json`. */
const MANAGED_KUBERNETES_PURLS: Readonly<Record<ManagedKubernetesProduct, string>> = {
  "amazon-eks": "pkg:generic/amazon-eks",
  "google-kubernetes-engine": "pkg:generic/google-kubernetes-engine",
  "azure-kubernetes-service": "pkg:generic/azure-kubernetes-service",
};

function isPlanJsonFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".json") && lower.includes("plan");
}

interface TerraformScanFiles {
  tfFiles: string[];
  planFiles: string[];
}

async function terraformFiles(root: string): Promise<TerraformScanFiles> {
  const tfFiles: string[] = [];
  const planFiles: string[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH) return;
    if (tfFiles.length >= MAXIMUM_FILES && planFiles.length >= MAXIMUM_PLAN_FILES) return;

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
        const lower = entry.name.toLowerCase();
        if ((VERSION_FILES.has(entry.name) || lower.endsWith(".tf")) && tfFiles.length < MAXIMUM_FILES) {
          tfFiles.push(join(directory, entry.name));
        } else if (isPlanJsonFileName(entry.name) && planFiles.length < MAXIMUM_PLAN_FILES) {
          planFiles.push(join(directory, entry.name));
        }
      }
    }
  }

  await walk(root, 0);
  return { tfFiles, planFiles };
}

/** The Package URL of a provider on the public registry. */
function providerPurl(namespace: string, name: string): string {
  return `pkg:generic/terraform-provider/${namespace}/${name}`;
}

/** `namespace` and `name` of a `required_providers` source, or undefined for a non-default registry host. */
function providerSource(source: string | undefined, localName: string): { namespace: string; name: string } | undefined {
  const parts = (source ?? `hashicorp/${localName}`).split("/");
  if (parts.length === 3) {
    if (parts[0]!.toLowerCase() !== REGISTRY_HOST) return undefined;
    parts.shift();
  }
  return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))
    ? { namespace: parts[0]!.toLowerCase(), name: parts[1]!.toLowerCase() }
    : undefined;
}

/** The rules of a registry grouped by their canonical Package URL identity; an unreadable purl is skipped. */
function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    let key: string;
    try {
      key = purlIdentity(rule.purl);
    } catch {
      continue;
    }
    const existing = grouped.get(key);
    if (existing) existing.push(rule);
    else grouped.set(key, [rule]);
  }
  return grouped;
}

function containsAll(rule: RegistryV2Rule, versions: readonly string[]): boolean {
  try {
    return versions.every((version) => versContains(rule.vers, version));
  } catch {
    return false;
  }
}

/** The first rule whose VERS range contains every listed version. A rule with a malformed VERS is skipped. */
function firstMatchingRule(rules: readonly RegistryV2Rule[], ...versions: string[]): RegistryV2Rule | undefined {
  return rules.find((rule) => containsAll(rule, versions));
}

function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

/** The rule a declared version or constraint matches; see the detector comment for the three cases. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  const exact = EXACT_VERSION.exec(value.trim())?.[1];
  if (exact) return firstMatchingRule(rules, exact);
  const pessimistic = PESSIMISTIC_PATCH.exec(value.trim());
  if (pessimistic) {
    const [, major, minor, patch] = pessimistic;
    const rule = firstMatchingRule(rules, `${major}.${minor}.${patch}`, `${major}.${minor}.999999999`);
    if (rule) return rule;
  }
  return rules.find(coversEveryVersion);
}

/**
 * The first rule whose VERS range contains every release a partial version could mean, for a database
 * engine version or a managed Kubernetes control-plane version: `12` admits 12.x, and `1.33` admits 1.33.x.
 */
function ruleForPartialVersion(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  const match = PARTIAL_VERSION.exec(value.trim());
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  const low = `${major}.${minor ?? "0"}.${patch ?? "0"}`;
  const high = `${major}.${minor ?? OPEN_END}.${patch ?? OPEN_END}`;
  return rules.find((rule) => containsAll(rule, low === high ? [low] : [low, high]));
}

export class TerraformDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "terraform";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [".terraform-version", ".tool-versions", ".terraform.lock.hcl", "*plan*.json", "*.tfplan.json"],
    extensions: [".tf"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/terraform.json` and `registry/database.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => [
      ...validateRegistryV2(await loadDataFile("registry/terraform.json")).rules,
      ...validateRegistryV2(await loadDataFile("registry/database.json")).rules,
    ],
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const { tfFiles, planFiles } = await terraformFiles(context.root);
    if (tfFiles.length === 0 && planFiles.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const cliRules = byPurl.get(TERRAFORM_PURL) ?? [];
    const findings: DetectorFinding[] = [];
    const unclassified: DetectorUnclassifiedReference[] = [];
    const report = (
      rule: RegistryV2Rule,
      path: string,
      locationKey: number | string,
      summary: string,
    ): void => {
      const line = typeof locationKey === "number" ? locationKey : undefined;
      findings.push({
        id: `${rule.id}:${path}:${locationKey}`,
        ruleId: rule.id,
        title: rule.title,
        summary,
        severity: rule.severity,
        location: { path, ...(line !== undefined ? { line } : {}) },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    };

    for (const file of tfFiles) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);

      if (name === ".terraform-version" || name === ".tool-versions") {
        for (const declaration of name === ".terraform-version" ? parseTerraformVersionFile(contents) : parseToolVersionsTerraform(contents)) {
          const rule = firstMatchingRule(cliRules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins Terraform ${declaration.value}. ${rule.summary}`);
        }
      } else if (name === ".terraform.lock.hcl") {
        for (const provider of parseTerraformLock(contents)) {
          const [host, namespace, providerName] = provider.address.split("/");
          if (host?.toLowerCase() !== REGISTRY_HOST || !namespace || !providerName) continue;
          const rule = firstMatchingRule(byPurl.get(providerPurl(namespace.toLowerCase(), providerName.toLowerCase())) ?? [], provider.value);
          if (rule) report(rule, path, provider.line, `${path} locks provider ${namespace}/${providerName} ${provider.value}. ${rule.summary}`);
        }
      } else {
        for (const declaration of parseTerraformFile(contents)) {
          if (declaration.kind === "required_version") {
            const rule = ruleForDeclared(cliRules, declaration.value);
            if (rule) report(rule, path, declaration.line, `${path} requires Terraform ${declaration.value}. ${rule.summary}`);
          } else {
            const source = providerSource(declaration.source, declaration.provider);
            if (!source) continue;
            const rule = ruleForDeclared(byPurl.get(providerPurl(source.namespace, source.name)) ?? [], declaration.value);
            if (rule) report(rule, path, declaration.line, `${path} requires provider ${source.namespace}/${source.name} ${declaration.value}. ${rule.summary}`);
          }
        }

        for (const declaration of parseManagedKubernetes(contents)) {
          const rules = byPurl.get(purlIdentity(MANAGED_KUBERNETES_PURLS[declaration.product])) ?? [];
          if (!declaration.literal) {
            unclassified.push({
              component: declaration.product,
              reference: declaration.value,
              reason: /^(var|local|module)\./.test(declaration.value)
                ? "the value is a variable or module reference, so Evergreen does not judge it"
                : "the value is not one plain version literal, so Evergreen does not judge it",
              location: { path, line: declaration.line },
            });
            continue;
          }
          const rule = ruleForPartialVersion(rules, declaration.value);
          if (rule) {
            const target = declaration.block === "module" ? `module.${declaration.name}` : `${declaration.block}.${declaration.name}`;
            report(rule, path, declaration.line, `${path} sets ${target} ${declaration.attribute} ${declaration.value}. ${rule.summary}`);
          } else if (!PARTIAL_VERSION.test(declaration.value.trim())) {
            unclassified.push({
              component: declaration.product,
              reference: declaration.value,
              reason: "the value is not a Kubernetes version number, so Evergreen does not judge it",
              location: { path, line: declaration.line },
            });
          }
        }
      }
    }

    for (const file of planFiles) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);

      for (const declaration of parseTerraformPlanJson(contents)) {
        if (declaration.kind === "cli_version") {
          const rule = ruleForDeclared(cliRules, declaration.value);
          if (rule) {
            report(rule, path, declaration.pointer, `${path} (${declaration.pointer}) resolves Terraform ${declaration.value}. ${rule.summary}`);
          }
        } else if (declaration.kind === "provider_version") {
          const source = providerSource(declaration.source, declaration.provider);
          if (!source) continue;
          const rule = ruleForDeclared(byPurl.get(providerPurl(source.namespace, source.name)) ?? [], declaration.value);
          if (rule) {
            report(rule, path, declaration.pointer, `${path} (${declaration.pointer}) constrains provider ${source.namespace}/${source.name} ${declaration.value}. ${rule.summary}`);
          }
        } else if (declaration.kind === "engine_version") {
          const purl = ENGINE_PURLS[declaration.engine.toLowerCase()];
          if (!purl) continue;
          const rules = byPurl.get(purlIdentity(purl)) ?? [];
          const rule = ruleForPartialVersion(rules, declaration.value);
          if (rule) {
            report(rule, path, declaration.address, `${path} (${declaration.address}) resolves ${declaration.resource}.${declaration.name} engine ${declaration.engine} ${declaration.value}. ${rule.summary}`);
          }
        }
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified };
  }
}

export const terraformDetector = new TerraformDetector();
