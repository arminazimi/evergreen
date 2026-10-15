// Converts a detector-specific v1 registry file into the shared v2 format.
//
//   node dist/tools/registry-v1-to-v2.js registry/npm.json \
//     --observed-at 2026-10-13 --reviewed-at 2026-10-14 --reviewer arminazimi [--out registry/npm.json]
//
// The result must validate as v2 and every rule must read back, through the loader's legacy view,
// exactly as it was in v1. Run it as maintainer tooling; scans never use it.

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { formatPurl, parsePurl } from "../src/purl.js";
import {
  legacyRule,
  lifecycleEvents,
  REGISTRY_V2_SCHEMA_VERSION,
  validateRegistryV2,
} from "../src/registry.js";
import type { LifecycleEvent, RegistryV2, RegistryV2Rule } from "../src/registry.js";

export interface ConvertOptions {
  /** Date the evidence was last seen at its sources (YYYY-MM-DD). */
  observedAt: string;
  /** Date a maintainer last reviewed the rules (YYYY-MM-DD). */
  reviewedAt: string;
  reviewer: string;
  freshnessDays?: number;
  /** Lifecycle event per rule id; overrides the built-in table. */
  events?: Record<string, LifecycleEvent>;
}

/**
 * Lifecycle event of each rule shipped in the v1 registries, chosen from what its own source states:
 * a release whose runtime is gone is unsupported, a retired release is removed, an announced
 * end of maintenance is end-of-life, and a maintainer deprecation or maintenance-mode notice is deprecated.
 */
export const bundledEvents: Record<string, LifecycleEvent> = {
  "github-actions.checkout.node20": "end-of-support",
  "github-actions.setup-node.node20": "end-of-support",
  "github-actions.cache.node20": "end-of-support",
  "github-actions.upload-artifact.retired": "removed",
  "github-actions.download-artifact.retired": "removed",
  "nodejs.runtime.eol-20": "end-of-life",
  "nodejs.runtime.eol-18": "end-of-life",
  "nodejs.runtime.legacy": "end-of-life",
  "npm.package.request.deprecated": "deprecated",
  "npm.package.node-sass.eol": "end-of-life",
  "npm.package.left-pad.deprecated": "deprecated",
  "python.runtime.eol-3.9-and-older": "end-of-life",
  "python.package.nose.maintenance-only": "deprecated",
  "python.package.django-nose.maintenance-only": "deprecated",
  "python.package.pycrypto.obsolete": "end-of-life",
};

type UnknownRecord = Record<string, unknown>;

const supportedEcosystems = ["github-actions", "nodejs", "npm", "python"];

/** Fields that move into the v2 rule unchanged; everything else in a v1 rule is a detector hint. */
const SHARED_FIELDS = ["id", "ecosystem", "title", "summary", "severity", "replacement", "deadline", "sources", "migration", "usage"];

interface Identity {
  purl: string;
  vers: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(rule: UnknownRecord, message: string): never {
  throw new Error(`Rule "${String(rule.id)}": ${message}`);
}

function npmPurl(name: string): string {
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash > 1) return formatPurl({ type: "npm", namespace: name.slice(0, slash), name: name.slice(slash + 1) });
  }
  return formatPurl({ type: "npm", name });
}

function identity(ecosystem: string, rule: UnknownRecord): Identity {
  switch (ecosystem) {
    case "github-actions": {
      if (typeof rule.action !== "string" || !Number.isInteger(rule.supportedFromMajor)) {
        fail(rule, "needs action and supportedFromMajor");
      }
      return {
        purl: formatPurl(parsePurl(`pkg:github/${rule.action}`)),
        vers: `vers:semver/<${rule.supportedFromMajor}.0.0`,
      };
    }
    case "nodejs": {
      if (Number.isInteger(rule.major)) {
        const major = rule.major as number;
        return { purl: "pkg:generic/nodejs", vers: `vers:semver/>=${major}.0.0|<${major + 1}.0.0` };
      }
      if (Number.isInteger(rule.maximumMajor)) {
        return { purl: "pkg:generic/nodejs", vers: `vers:semver/<${(rule.maximumMajor as number) + 1}.0.0` };
      }
      return fail(rule, "needs major or maximumMajor");
    }
    case "npm": {
      if (typeof rule.package !== "string") fail(rule, "needs package");
      return { purl: npmPurl(rule.package), vers: "vers:npm/*" };
    }
    case "python": {
      if (rule.kind === "runtime") {
        const match = typeof rule.maximumVersion === "string" ? /^(\d+)\.(\d+)$/.exec(rule.maximumVersion) : null;
        if (!match) fail(rule, "runtime rules need maximumVersion as MAJOR.MINOR");
        return { purl: "pkg:generic/python", vers: `vers:pypi/<${match[1]}.${Number(match[2]) + 1}` };
      }
      if (rule.kind === "package" && typeof rule.package === "string") {
        return { purl: formatPurl(parsePurl(`pkg:pypi/${rule.package}`)), vers: "vers:pypi/*" };
      }
      return fail(rule, 'needs kind "runtime" or "package" (with package)');
    }
    default:
      throw new Error(`No v1 → v2 mapping for ecosystem "${ecosystem}".`);
  }
}

export function convertRegistryV1(value: unknown, options: ConvertOptions): RegistryV2 {
  if (!isRecord(value) || typeof value.schemaVersion !== "string" || !Array.isArray(value.rules)) {
    throw new Error("Input must be a v1 registry object with a schemaVersion and rules.");
  }
  const ecosystem = /^evergreen\.([a-z0-9-]+)-registry\.v1$/.exec(value.schemaVersion)?.[1];
  if (!ecosystem) throw new Error(`Not a v1 registry: ${value.schemaVersion}`);
  if (!supportedEcosystems.includes(ecosystem)) throw new Error(`No v1 → v2 mapping for ecosystem "${ecosystem}".`);
  const sourceRules: unknown[] = value.rules;

  const rules: RegistryV2Rule[] = sourceRules.map((raw) => {
    if (!isRecord(raw)) throw new Error("Every rule must be an object.");
    const id = String(raw.id);
    const event = options.events?.[id] ?? bundledEvents[id];
    if (!event || !lifecycleEvents.includes(event)) {
      throw new Error(`No lifecycle event for rule "${id}". Pass --event ${id}=<${lifecycleEvents.join("|")}>.`);
    }
    const { purl, vers } = identity(ecosystem, raw);
    const hints: UnknownRecord = {};
    for (const [key, hint] of Object.entries(raw)) if (!SHARED_FIELDS.includes(key)) hints[key] = hint;

    const rule: UnknownRecord = {
      id: raw.id,
      ecosystem: raw.ecosystem,
      purl,
      vers,
      event,
      title: raw.title,
      summary: raw.summary,
      severity: raw.severity,
    };
    for (const key of ["replacement", "deadline"]) if (raw[key] !== undefined) rule[key] = raw[key];
    rule.sources = raw.sources;
    rule.provenance = { observedAt: options.observedAt, reviewedAt: options.reviewedAt, reviewer: options.reviewer };
    for (const key of ["migration", "usage"]) if (raw[key] !== undefined) rule[key] = raw[key];
    if (Object.keys(hints).length > 0) rule[`x-${String(raw.ecosystem)}`] = hints;
    return rule as unknown as RegistryV2Rule;
  });

  const registry = validateRegistryV2({
    schemaVersion: REGISTRY_V2_SCHEMA_VERSION,
    ecosystem,
    ...(options.freshnessDays ? { freshness: { maxReviewAgeDays: options.freshnessDays } } : {}),
    rules,
  });

  // The migration must not change what detectors see.
  registry.rules.forEach((rule, index) => {
    if (!isDeepStrictEqual(legacyRule(rule), sourceRules[index])) {
      throw new Error(`Rule "${rule.id}" does not read back as its v1 form; refusing to convert.`);
    }
  });
  return registry;
}

function parseArguments(argv: string[]): { file: string; options: ConvertOptions; out?: string } {
  const events: Record<string, LifecycleEvent> = {};
  const values = new Map<string, string>();
  let file: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      file = argument;
      continue;
    }
    const next = argv[++index];
    if (next === undefined) throw new Error(`${argument} needs a value.`);
    if (argument === "--event") {
      const [id, event] = next.split("=");
      if (!id || !event || !lifecycleEvents.includes(event as LifecycleEvent)) throw new Error(`--event expects <rule-id>=<${lifecycleEvents.join("|")}>.`);
      events[id] = event as LifecycleEvent;
    } else {
      values.set(argument, next);
    }
  }
  const required = (name: string) => values.get(name) ?? (() => { throw new Error(`${name} is required.`); })();
  if (!file) throw new Error("Usage: registry-v1-to-v2 <registry.json> --observed-at D --reviewed-at D --reviewer NAME [--freshness-days N] [--event ID=EVENT] [--out FILE]");
  const days = values.get("--freshness-days");
  return {
    file,
    ...(values.has("--out") ? { out: values.get("--out")! } : {}),
    options: {
      observedAt: required("--observed-at"),
      reviewedAt: required("--reviewed-at"),
      reviewer: required("--reviewer"),
      ...(days ? { freshnessDays: Number(days) } : {}),
      events,
    },
  };
}

export async function main(argv: string[]): Promise<void> {
  const { file, options, out } = parseArguments(argv);
  const converted = convertRegistryV1(JSON.parse(await readFile(file, "utf8")) as unknown, options);
  const text = `${JSON.stringify(converted, null, 2)}\n`;
  if (out) await writeFile(out, text);
  else process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
