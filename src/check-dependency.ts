import { readFile } from "node:fs/promises";

import type { EvidenceSource, MigrationGuidance, Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import { findPackageFile } from "./package-files.js";
import { parsePurl, PurlError, purlIdentity } from "./purl.js";
import { validateRegistryV2 } from "./registry.js";
import type { LifecycleEvent, RegistryV2Rule } from "./registry.js";
import { parseVersLenient, versContains } from "./vers.js";

export const CHECK_SCHEMA_VERSION = "evergreen.check.v1" as const;

/** The bundled registries a dependency is looked up in. */
const BUNDLED_REGISTRIES = ["github-actions", "nodejs", "npm", "python"] as const;

export type CheckStatus =
  /** A rule says this package (and version, when given) has a lifecycle problem. */
  | "affected"
  /** Rules exist for the package, but they apply to versions the caller has not named. */
  | "version-dependent"
  /** Rules exist for the package, and none of them covers the named version. */
  | "not-affected"
  /** Evergreen has no rule for this package. That is not a statement that it is safe. */
  | "no-data";

export interface DependencyFinding {
  ruleId: string;
  ecosystem: string;
  event: LifecycleEvent;
  severity: Severity;
  title: string;
  summary: string;
  replacement?: string;
  deadline?: string;
  /** The VERS range the rule applies to. */
  affectedVersions: string;
  sources: EvidenceSource[];
  migration?: MigrationGuidance;
}

export interface DependencyCheck {
  schemaVersion: typeof CHECK_SCHEMA_VERSION;
  /** Version-less canonical PURL, the identity rules are written against. */
  purl: string;
  version?: string;
  status: CheckStatus;
  findings: DependencyFinding[];
  /** Highest severity among the findings, when there are any. */
  severity?: Severity;
  /** One sentence a person or an agent can show as is. */
  message: string;
}

export class CheckDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckDependencyError";
  }
}

export interface CheckDependencyInput {
  /** A PURL such as `pkg:npm/request` or `pkg:npm/request@2.88.2`. */
  purl: string;
  /** An exact version; overrides a version written in the PURL. */
  version?: string;
}

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

/** GitHub Action refs are written `v4` or `v4.1`; VERS needs full semantic versions. */
function normalizeVersion(type: string, version: string): string {
  if (type !== "github") return version;
  const bare = version.replace(/^v/i, "");
  if (/^\d+$/.test(bare)) return `${bare}.0.0`;
  if (/^\d+\.\d+$/.test(bare)) return `${bare}.0`;
  return bare;
}

function toFinding(rule: RegistryV2Rule): DependencyFinding {
  return {
    ruleId: rule.id,
    ecosystem: rule.ecosystem,
    event: rule.event,
    severity: rule.severity,
    title: rule.title,
    summary: rule.summary,
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    affectedVersions: rule.vers,
    sources: rule.sources,
    ...(rule.migration ? { migration: rule.migration } : {}),
  };
}

function bySeverity(left: DependencyFinding, right: DependencyFinding): number {
  return (
    (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) ||
    (left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0)
  );
}

function summarize(status: CheckStatus, purl: string, version: string | undefined, findings: DependencyFinding[]): string {
  const subject = version ? `${purl}@${version}` : purl;
  const top = findings[0];
  switch (status) {
    case "affected":
      return `${subject}: ${top!.title}. ${top!.summary}${top!.replacement ? ` Replacement: ${top!.replacement}.` : ""}`;
    case "version-dependent":
      return `${subject}: ${findings.length === 1 ? "a lifecycle rule applies" : `${findings.length} lifecycle rules apply`} to some versions (${findings.map((finding) => finding.affectedVersions).join(", ")}). Check again with a version.`;
    case "not-affected":
      return `${subject}: Evergreen has rules for this package, and none applies to this version.`;
    case "no-data":
      return `${subject}: Evergreen has no lifecycle rule for this package. That does not mean it is safe.`;
  }
}

/** Checks one dependency against rules. Pure: it reads no files and uses no network. */
export function checkAgainst(rules: readonly RegistryV2Rule[], input: CheckDependencyInput): DependencyCheck {
  let parsed;
  try {
    parsed = parsePurl(input.purl);
  } catch (error) {
    if (error instanceof PurlError) throw new CheckDependencyError(error.message);
    throw error;
  }
  const identity = purlIdentity(parsed);
  const rawVersion = input.version ?? parsed.version;
  const version = rawVersion === undefined || rawVersion === "" ? undefined : normalizeVersion(parsed.type, rawVersion);

  const candidates = rules.filter((rule) => rule.purl === identity);
  let status: CheckStatus;
  let matching: RegistryV2Rule[];

  if (candidates.length === 0) {
    status = "no-data";
    matching = [];
  } else if (version === undefined) {
    const coversEveryVersion = candidates.filter((rule) => parseVersLenient(rule.vers).all);
    status = coversEveryVersion.length > 0 ? "affected" : "version-dependent";
    matching = coversEveryVersion.length > 0 ? coversEveryVersion : candidates;
  } else {
    try {
      matching = candidates.filter((rule) => versContains(rule.vers, version));
    } catch (error) {
      throw new CheckDependencyError(`"${rawVersion}" is not a valid version for ${identity}: ${error instanceof Error ? error.message : String(error)}`);
    }
    status = matching.length > 0 ? "affected" : "not-affected";
  }

  const findings = matching.map(toFinding).sort(bySeverity);
  const shownVersion = version === undefined ? undefined : rawVersion;
  return {
    schemaVersion: CHECK_SCHEMA_VERSION,
    purl: identity,
    ...(shownVersion === undefined ? {} : { version: shownVersion }),
    status,
    findings,
    ...(findings[0] ? { severity: findings[0].severity } : {}),
    message: summarize(status, identity, shownVersion, findings),
  };
}

let bundled: Promise<RegistryV2Rule[]> | undefined;

/** The lifecycle rules bundled with this release, loaded once and validated. */
export async function bundledRules(): Promise<RegistryV2Rule[]> {
  bundled ??= (async () => {
    const rules: RegistryV2Rule[] = [];
    for (const name of BUNDLED_REGISTRIES) {
      const path = await findPackageFile(`registry/${name}.json`, import.meta.url);
      rules.push(...validateRegistryV2(JSON.parse(await readFile(path, "utf8")) as unknown).rules);
    }
    return rules;
  })();
  return bundled;
}

/**
 * Checks a single package (and optionally one version) against Evergreen's bundled lifecycle rules,
 * without scanning a repository. Deterministic and offline.
 */
export async function checkDependency(input: CheckDependencyInput | string): Promise<DependencyCheck> {
  return checkAgainst(await bundledRules(), typeof input === "string" ? { purl: input } : input);
}
