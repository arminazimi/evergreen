import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseTerraformLock } from "./parse-lock.js";
import { parseTerraformFile } from "./parse-terraform.js";
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
 * Terraform is never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", ".terraform", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const VERSION_FILES = new Set([".terraform-version", ".tool-versions", ".terraform.lock.hcl"]);
const TERRAFORM_PURL = "pkg:generic/terraform";
const REGISTRY_HOST = "registry.terraform.io";
const EXACT_VERSION = /^=?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const PESSIMISTIC_PATCH = /^~>\s*(\d+)\.(\d+)\.(\d+)$/;

async function terraformFiles(root: string): Promise<string[]> {
  const files: string[] = [];
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
      } else if (entry.isFile() && (VERSION_FILES.has(entry.name) || entry.name.toLowerCase().endsWith(".tf"))) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
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

export class TerraformDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "terraform";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: [".terraform-version", ".tool-versions", ".terraform.lock.hcl"], extensions: [".tf"] };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/terraform.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/terraform.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await terraformFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const cliRules = byPurl.get(TERRAFORM_PURL) ?? [];
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
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified: [] };
  }
}

export const terraformDetector = new TerraformDetector();
