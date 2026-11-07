import { severityValues } from "./domain.js";
import { getActiveData, loadDataFile } from "./data-source.js";
import { dataInfoFrom } from "./data-status.js";
import { recordCheck } from "./usage-log.js";
import { CHECK_SCHEMA_VERSION } from "./check-dependency-types.js";
import type { CheckStatus, DependencyCheck, DependencyFinding } from "./check-dependency-types.js";
import { parsePurl, PurlError, purlIdentity } from "./purl.js";
import { required } from "./required.js";
import { validateRegistryV2 } from "./registry.js";
import type { RegistryV2Rule } from "./registry.js";
import { parseVersLenient, versContains } from "./vers.js";
import { EvergreenError } from "./evergreen-error.js";

export { CHECK_SCHEMA_VERSION };
export type { CheckStatus, DependencyCheck, DependencyFinding };

/** The bundled registries a dependency is looked up in. */
const BUNDLED_REGISTRIES = ["github-actions", "nodejs", "npm", "python"] as const;

/** Thrown when the input cannot be checked, such as an invalid PURL or version. */
export class CheckDependencyError extends EvergreenError {
  constructor(message: string) {
    super("invalid-purl", message);
    this.name = "CheckDependencyError";
  }
}

/** A package to look up, named by PURL and optionally pinned to one version. */
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

function summarize(
  status: CheckStatus,
  purl: string,
  version: string | undefined,
  findings: DependencyFinding[],
): string {
  const subject = version ? `${purl}@${version}` : purl;
  switch (status) {
    // An "affected" status is only set together with the rules that matched, so the first finding is there.
    case "affected": {
      const top = required(findings[0], "matching finding");
      return `${subject}: ${top.title}. ${top.summary}${top.replacement ? ` Replacement: ${top.replacement}.` : ""}`;
    }
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
  const parsed = parseCheckPurl(input.purl);
  const identity = purlIdentity(parsed);
  const rawVersion = input.version ?? parsed.version;
  const version = rawVersion === undefined || rawVersion === "" ? undefined : normalizeVersion(parsed.type, rawVersion);

  const { status, matching } = matchCandidates(
    rules.filter((rule) => rule.purl === identity),
    identity,
    rawVersion,
    version,
  );
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

/** Parses the purl the caller gave, turning a malformed one into a CheckDependencyError. */
function parseCheckPurl(purl: string): ReturnType<typeof parsePurl> {
  try {
    return parsePurl(purl);
  } catch (error) {
    if (error instanceof PurlError) throw new CheckDependencyError(error.message);
    throw error;
  }
}

/**
 * Decides the status and the rules that explain it. Without a version, a rule that covers every version
 * makes the package affected; otherwise the answer depends on the version.
 */
function matchCandidates(
  candidates: readonly RegistryV2Rule[],
  identity: string,
  rawVersion: string | undefined,
  version: string | undefined,
): { status: CheckStatus; matching: readonly RegistryV2Rule[] } {
  if (candidates.length === 0) return { status: "no-data", matching: [] };
  if (version === undefined) {
    const coversEveryVersion = candidates.filter((rule) => parseVersLenient(rule.vers).all);
    return coversEveryVersion.length > 0
      ? { status: "affected", matching: coversEveryVersion }
      : { status: "version-dependent", matching: candidates };
  }
  const matching = rulesContaining(candidates, identity, rawVersion, version);
  return { status: matching.length > 0 ? "affected" : "not-affected", matching };
}

function rulesContaining(
  candidates: readonly RegistryV2Rule[],
  identity: string,
  rawVersion: string | undefined,
  version: string,
): RegistryV2Rule[] {
  try {
    return candidates.filter((rule) => versContains(rule.vers, version));
  } catch (error) {
    throw new CheckDependencyError(
      `"${rawVersion}" is not a valid version for ${identity}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

let loaded: { source: Promise<unknown>; rules: Promise<RegistryV2Rule[]> } | undefined;

/** The lifecycle rules in use (downloaded data when it verifies, else those bundled with this release), validated. */
export async function bundledRules(): Promise<RegistryV2Rule[]> {
  const source = getActiveData();
  if (loaded?.source !== source) {
    loaded = {
      source,
      rules: (async () => {
        const rules: RegistryV2Rule[] = [];
        for (const name of BUNDLED_REGISTRIES) {
          rules.push(...validateRegistryV2(await loadDataFile(`registry/${name}.json`)).rules);
        }
        return rules;
      })(),
    };
  }
  return loaded.rules;
}

const SYSTEM_REGISTRIES = ["nodejs", "python", "go", "java", "dotnet", "terraform"] as const;

/** The rules for the runtimes and tools installed on a machine, which `check` itself does not look up. */
export async function systemToolRules(): Promise<RegistryV2Rule[]> {
  const rules: RegistryV2Rule[] = [];
  for (const name of SYSTEM_REGISTRIES) {
    rules.push(...validateRegistryV2(await loadDataFile(`registry/${name}.json`)).rules);
  }
  return rules;
}

/**
 * Checks a single package (and optionally one version) against Evergreen's bundled lifecycle rules,
 * without scanning a repository. Deterministic and offline.
 */
export async function checkDependency(input: CheckDependencyInput | string): Promise<DependencyCheck> {
  const rules = await bundledRules();
  const check = checkAgainst(rules, typeof input === "string" ? { purl: input } : input);
  const result = { ...check, data: dataInfoFrom(await getActiveData()) };
  await recordCheck(result);
  return result;
}
