import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { EvidenceSource, Severity } from "./domain.js";
import { CLE_SCHEMA } from "./export/cle.js";
import { relativePosix } from "./paths.js";
import { parsePurl, purlIdentity, PurlError } from "./purl.js";
import { DETECTOR_API_VERSION } from "./sdk.js";
import type { Detector, DetectorContext, DetectorFinding, DetectorInputs } from "./sdk.js";
import { versContains } from "./vers/index.js";

/** File name Evergreen looks for at the root of an installed package. */
export const CLE_FILE_NAME = "cle.json";

const REPORTABLE = new Set(["endOfSupport", "endOfLife", "endOfDevelopment", "endOfDistribution"] as const);
type ReportableType = "endOfSupport" | "endOfLife" | "endOfDevelopment" | "endOfDistribution";

const REACHED_SEVERITY: Record<ReportableType, Severity> = {
  endOfLife: "high",
  endOfDistribution: "high",
  endOfSupport: "medium",
  endOfDevelopment: "medium",
};

const TITLE: Record<ReportableType, string> = {
  endOfLife: "End of life",
  endOfDistribution: "End of distribution",
  endOfSupport: "End of support",
  endOfDevelopment: "End of development",
};

const SKIPPED_NODE_MODULES = new Set([".bin", ".cache"]);

interface CleVersionSpec {
  range: string;
}

interface CleEventRecord {
  id: number;
  type: string;
  effective: string;
  published: string;
  versions?: CleVersionSpec[];
  description?: string;
  references?: string[];
}

interface CleDocumentRecord {
  $schema: string;
  identifier: string | string[];
  updatedAt: string;
  events: CleEventRecord[];
}

interface ClePackage {
  directory: string;
  clePath: string;
  document: CleDocumentRecord;
  manifest: Record<string, unknown>;
}

export interface CleIngestOptions {
  /**
   * ISO-8601 scan time used to decide scheduled vs reached severity (decision 0010).
   * Callers must pass the same timestamp the scan uses; do not read the clock here.
   */
  readonly scannedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Parses a CLE 1.0 document without inventing lifecycle claims. Malformed input yields undefined. */
export function parseCleDocument(input: unknown): CleDocumentRecord | undefined {
  if (!isRecord(input) || input.$schema !== CLE_SCHEMA) return undefined;
  if (!isNonEmptyString(input.updatedAt) || !Array.isArray(input.events)) return undefined;
  const identifiers = Array.isArray(input.identifier)
    ? input.identifier.filter(isNonEmptyString)
    : isNonEmptyString(input.identifier) ? [input.identifier] : [];
  if (identifiers.length === 0) return undefined;
  const events: CleEventRecord[] = [];
  for (const raw of input.events) {
    if (!isRecord(raw) || typeof raw.id !== "number" || !Number.isInteger(raw.id) || raw.id < 1) return undefined;
    if (!isNonEmptyString(raw.type) || !isNonEmptyString(raw.effective) || !isNonEmptyString(raw.published)) return undefined;
    const event: CleEventRecord = {
      id: raw.id,
      type: raw.type,
      effective: raw.effective,
      published: raw.published,
    };
    if (raw.versions !== undefined) {
      if (!Array.isArray(raw.versions) || raw.versions.length === 0) return undefined;
      const versions: CleVersionSpec[] = [];
      for (const spec of raw.versions) {
        if (!isRecord(spec) || !isNonEmptyString(spec.range)) return undefined;
        versions.push({ range: spec.range });
      }
      event.versions = versions;
    }
    if (raw.description !== undefined) {
      if (!isNonEmptyString(raw.description)) return undefined;
      event.description = raw.description;
    }
    if (raw.references !== undefined) {
      if (!Array.isArray(raw.references) || !raw.references.every(isNonEmptyString)) return undefined;
      event.references = raw.references;
    }
    events.push(event);
  }
  return {
    $schema: CLE_SCHEMA,
    identifier: identifiers.length === 1 ? identifiers[0]! : identifiers,
    updatedAt: input.updatedAt,
    events,
  };
}

function deadlineOf(effective: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(effective);
  return match?.[1];
}

/** True when the event's effective time is still in the future relative to the scan timestamp. */
function isScheduled(effective: string, scannedAt: string): boolean {
  const effectiveMs = Date.parse(effective);
  const scannedMs = Date.parse(scannedAt);
  if (!Number.isFinite(effectiveMs) || !Number.isFinite(scannedMs)) return false;
  return effectiveMs > scannedMs;
}

function packagePurl(name: string): string | undefined {
  if (!name || name.startsWith(".") || name.includes("\\") || name.includes("..")) return undefined;
  try {
    if (name.startsWith("@")) {
      const slash = name.indexOf("/");
      if (slash <= 1 || slash === name.length - 1) return undefined;
      return purlIdentity(`pkg:npm/${name.slice(1, slash)}/${name.slice(slash + 1)}`);
    }
    return purlIdentity(`pkg:npm/${name}`);
  } catch (error) {
    if (error instanceof PurlError) return undefined;
    throw error;
  }
}

function identifiersMatch(document: CleDocumentRecord, packageIdentity: string): boolean {
  const listed = Array.isArray(document.identifier) ? document.identifier : [document.identifier];
  return listed.some((value) => {
    try {
      return purlIdentity(value) === packageIdentity;
    } catch (error) {
      if (error instanceof PurlError) return false;
      throw error;
    }
  });
}

function eventApplies(event: CleEventRecord, version: string): boolean {
  if (!REPORTABLE.has(event.type as ReportableType)) return false;
  if (!event.versions?.length) return false;
  return event.versions.some((spec) => {
    try {
      return versContains(spec.range, version);
    } catch {
      return false;
    }
  });
}

function sourcesFor(clePath: string, event: CleEventRecord): EvidenceSource[] {
  const sources: EvidenceSource[] = [
    { title: "Maintainer CLE declaration", url: pathToFileURL(clePath).href },
  ];
  for (const reference of event.references ?? []) {
    if (/^https?:\/\//i.test(reference)) sources.push({ title: "CLE event reference", url: reference });
  }
  return sources;
}

function ruleIdFor(packageIdentity: string, event: CleEventRecord): string {
  const slug = packageIdentity.replace(/^pkg:/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cle.${event.type}.${slug}.${event.id}`;
}

function findingFor(
  root: string,
  clePath: string,
  packageIdentity: string,
  version: string,
  event: CleEventRecord,
  scannedAt: string,
): DetectorFinding {
  const type = event.type as ReportableType;
  const path = relativePosix(root, clePath);
  const deadline = deadlineOf(event.effective);
  const scheduled = isScheduled(event.effective, scannedAt);
  const title = scheduled
    ? `${TITLE[type]} scheduled (maintainer CLE)`
    : `${TITLE[type]} (maintainer CLE)`;
  const detail = event.description?.trim() || `${packageIdentity}@${version} matches a maintainer-declared ${type} event.`;
  const when = deadline
    ? scheduled ? ` Scheduled for ${deadline}.` : ` Effective ${deadline}.`
    : "";
  const ruleId = ruleIdFor(packageIdentity, event);
  return {
    id: `${ruleId}:${path}:1`,
    ruleId,
    title,
    summary: `${detail}${when}`,
    severity: scheduled ? "low" : REACHED_SEVERITY[type],
    location: { path, line: 1 },
    ...(deadline ? { deadline } : {}),
    sources: sourcesFor(clePath, event),
  };
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/**
 * Installed packages that ship a parseable CLE document next to package.json.
 * Reads `cle.json` first so ordinary packages cost one failed read; only then opens package.json.
 */
async function clePackages(root: string): Promise<ClePackage[]> {
  const found: ClePackage[] = [];
  async function walkNodeModules(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink() || SKIPPED_NODE_MODULES.has(entry.name)) continue;
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name === ".pnpm") {
        let stores;
        try {
          stores = await readdir(path, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const store of stores.sort((left, right) => left.name.localeCompare(right.name))) {
          if (store.isSymbolicLink() || !store.isDirectory()) continue;
          await walkNodeModules(join(path, store.name, "node_modules"));
        }
        continue;
      }
      if (entry.name.startsWith("@")) {
        let scoped;
        try {
          scoped = await readdir(path, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const child of scoped.sort((left, right) => left.name.localeCompare(right.name))) {
          if (child.isSymbolicLink() || !child.isDirectory()) continue;
          await considerPackage(join(path, child.name));
        }
        continue;
      }
      await considerPackage(path);
    }
  }
  async function considerPackage(directory: string): Promise<void> {
    const clePath = join(directory, CLE_FILE_NAME);
    const document = parseCleDocument(await readJson(clePath));
    if (document) {
      const manifest = await readJson(join(directory, "package.json"));
      if (isRecord(manifest)) found.push({ directory, clePath, document, manifest });
    }
    await walkNodeModules(join(directory, "node_modules"));
  }
  await walkNodeModules(join(root, "node_modules"));
  return found.sort((left, right) => left.directory.localeCompare(right.directory));
}

/** Findings from maintainer CLE documents shipped inside installed packages. Offline only. */
export async function ingestCle(root: string, options: CleIngestOptions): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];
  for (const { clePath, document, manifest } of await clePackages(root)) {
    if (!isNonEmptyString(manifest.name) || !isNonEmptyString(manifest.version)) continue;
    const packageIdentity = packagePurl(manifest.name);
    if (!packageIdentity || !identifiersMatch(document, packageIdentity)) continue;
    // CLE may include a version on the identifier; identity comparison already strips it.
    try {
      for (const value of Array.isArray(document.identifier) ? document.identifier : [document.identifier]) {
        parsePurl(value);
      }
    } catch (error) {
      if (error instanceof PurlError) continue;
      throw error;
    }
    for (const event of document.events) {
      if (!eventApplies(event, manifest.version)) continue;
      findings.push(findingFor(root, clePath, packageIdentity, manifest.version, event, options.scannedAt));
    }
  }
  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

/** Reads CLE documents from installed packages during a repository scan. */
export class CleIngestDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "cle";
  readonly inputs: DetectorInputs = {
    fileNames: [CLE_FILE_NAME, "package.json"],
    directories: ["node_modules"],
  };

  async scan(context: DetectorContext): Promise<readonly DetectorFinding[]> {
    // The engine always passes scannedAt. Harnesses that call scan({ root }) omit it; without a
    // timestamp every matching event is treated as reached so we never read the clock here.
    return ingestCle(context.root, { scannedAt: context.scannedAt ?? "9999-12-31T23:59:59.999Z" });
  }
}

export const cleDetector = new CleIngestDetector();
