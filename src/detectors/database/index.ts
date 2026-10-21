import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "../../vers/index.js";
import { parseDatabaseCompose } from "./parse-compose.js";
import { parseDatabaseTerraform } from "./parse-terraform.js";

/**
 * Database runtimes lifecycle detector.
 *
 * It reads the image tag of `postgres`, `mysql`, `mariadb`, `redis`, and `mongo` services in Compose files, and
 * the literal `engine_version` of `postgres`, `mysql`, `mariadb`, and `redis` engines on managed database
 * resources in `*.tf` files. Each declaration is matched against the rules for that product's Package URL.
 *
 * A tag or engine version is read as the leading `major`, `major.minor`, or `major.minor.patch` followed by
 * nothing or a `-suffix` (`12`, `5.7-alpine`, `8.4.3`). `latest`, a bare variant such as `alpine`, and anything
 * else carry no version and are never matched. A partial version admits every release it prefixes, so it matches
 * a rule only when the rule's VERS range contains both ends of that span: `postgres:12` matches a PostgreSQL 12
 * rule, `mysql:5` matches no MySQL 5.7 rule. A rule whose VERS is malformed never matches and does not hide a
 * later rule. Nothing is executed and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", ".terraform", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const COMPOSE_NAME = /^(?:docker-)?compose(?:\.[A-Za-z0-9_.-]+)?\.ya?ml$/;
const OPEN_END = "999999999";
const VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z][0-9A-Za-z._-]*)?$/;

/** The Package URL of each product as written in `registry/database.json`. */
const PRODUCT_PURLS: Readonly<Record<string, string>> = {
  postgres: "pkg:generic/postgresql",
  mysql: "pkg:generic/mysql",
  mariadb: "pkg:generic/mariadb",
  redis: "pkg:generic/redis",
  mongo: "pkg:generic/mongodb",
};

async function databaseFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && (COMPOSE_NAME.test(entry.name) || entry.name.toLowerCase().endsWith(".tf"))) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
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

/** The first rule whose VERS range contains every release the declared tag or version could mean. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  const match = VERSION.exec(value.trim());
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  const low = `${major}.${minor ?? "0"}.${patch ?? "0"}`;
  const high = `${major}.${minor ?? OPEN_END}.${patch ?? OPEN_END}`;
  return rules.find((rule) => containsAll(rule, low === high ? [low] : [low, high]));
}

function purlFor(product: string): string | undefined {
  const purl = PRODUCT_PURLS[product];
  return purl === undefined ? undefined : purlIdentity(purl);
}

export class DatabaseDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "database";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml"],
    extensions: [".tf"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/database.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/database.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await databaseFiles(context.root);
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
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);

      if (COMPOSE_NAME.test(basename(file))) {
        for (const declaration of parseDatabaseCompose(contents)) {
          const purl = purlFor(declaration.product);
          const rule = purl === undefined ? undefined : ruleForDeclared(byPurl.get(purl) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} runs ${declaration.product}:${declaration.value}. ${rule.summary}`);
        }
      } else {
        for (const declaration of parseDatabaseTerraform(contents)) {
          const purl = purlFor(declaration.engine);
          const rule = purl === undefined ? undefined : ruleForDeclared(byPurl.get(purl) ?? [], declaration.value);
          if (rule) {
            report(rule, path, declaration.line, `${path} sets ${declaration.resource}.${declaration.name} engine ${declaration.engine} ${declaration.value}. ${rule.summary}`);
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

export const databaseDetector = new DatabaseDetector();
