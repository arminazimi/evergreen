import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { workflowCommandFindings, workflowCommandPrefix } from "./github-actions-workflow-commands.js";
import { relativePosix } from "../paths.js";
import type { DeprecationRule } from "../domain.js";
import { loadDataFile } from "../data-source.js";
import { DETECTOR_API_VERSION, isDeprecationRule } from "../sdk.js";
import { ruleFinding } from "../rule-finding.js";
import { loadRegistryRules, validateRegistryV2 } from "../registry.js";
import type { RegistryV2Rule } from "../registry.js";
import { versContains } from "../vers.js";
import { classifyDotnetVersion, setupDotnetVersions } from "./github-actions-dotnet.js";
import { classifyNodeVersion, setupNodeVersions } from "./github-actions-node.js";
import type {
  Detector,
  DetectorAnalysis,
  DetectorContext,
  DetectorFinding,
  DetectorUnclassifiedReference,
  DetectorInputs,
} from "../sdk.js";

export interface GitHubActionRule extends DeprecationRule {
  action: string;
  supportedFromMajor: number;
}

interface GitHubActionsShaRegistry {
  schemaVersion: "evergreen.github-actions-shas.v1";
  actions: Record<string, Record<string, string>>;
}

interface ActionReference {
  action: string;
  ref: string;
  /** The trailing comment (including `#`), when present. */
  comment?: string;
  line: number;
}

const USES_PATTERN = /^\s*(?:-\s*)?uses\s*:\s*["']?([^\s#"']+)["']?(\s+#.*)?\s*$/;
const VERSION_PATTERN = /^v?(\d+)(?:\.\d+){0,2}$/;
const SHA_PATTERN = /^[a-fA-F0-9]{40}$/;

/**
 * A version declared by a trailing comment on a SHA-pinned reference. The version must start the
 * comment (after the `#` and any whitespace), in one of these forms: `# v4`, `# v4.1`, `# v4.1.1`,
 * `#v4.1.1`, `# 4.1.1`, `# v4.1.1 (pinned for security)`, `# tag=v4.1.1`, or `# version: v4.1.1`.
 * The `(?![.\d])` stopper rejects typos such as `# v4..1` and `# v4.1.1.1`, which would otherwise
 * truncate to a plausible version.
 */
const COMMENT_VERSION = /^#\s*(?:(v?\d+(?:\.\d+){0,2})(?![.\d])|(?:tag=|version:\s*)(v?\d+(?:\.\d+){0,2})(?![.\d]))/;

/**
 * A second version token later in the same comment signals conflicting versions (for example
 * `# v3 -> v4`). The `v` prefix is required, so a bare year in a trailing explanation such as
 * `# v4.1.1 (pinned in 2024)` is not mistaken for a version.
 */
const CONFLICTING_VERSION = /\bv\d+(?:\.\d+){0,2}\b/;

function isActionRule(value: DeprecationRule): value is GitHubActionRule {
  return (
    "action" in value &&
    typeof value.action === "string" &&
    "supportedFromMajor" in value &&
    typeof value.supportedFromMajor === "number"
  );
}

async function loadRegistry(): Promise<GitHubActionRule[]> {
  const registry = loadRegistryRules(await loadDataFile("registry/github-actions.json"), {
    schemaVersion: "evergreen.github-actions-registry.v1",
    isRule: (value): value is DeprecationRule =>
      isDeprecationRule(value) && (value.id.startsWith(workflowCommandPrefix) || isActionRule(value)),
  });
  return registry.rules.filter(isActionRule);
}

async function loadShaRegistry(): Promise<Map<string, ReadonlyMap<string, string>>> {
  const value = (await loadDataFile("registry/github-actions-shas.json")) as GitHubActionsShaRegistry;
  if (
    value.schemaVersion !== "evergreen.github-actions-shas.v1" ||
    !value.actions ||
    typeof value.actions !== "object" ||
    Array.isArray(value.actions)
  ) {
    throw new Error("Invalid GitHub Actions SHA registry");
  }

  const actions = new Map<string, ReadonlyMap<string, string>>();
  for (const [action, references] of Object.entries(value.actions)) {
    if (!action.includes("/") || !references || typeof references !== "object") {
      throw new Error(`Invalid GitHub Actions SHA registry entry for ${action}`);
    }
    const versions = new Map<string, string>();
    for (const [sha, version] of Object.entries(references)) {
      if (!SHA_PATTERN.test(sha) || !VERSION_PATTERN.test(version)) {
        throw new Error(`Invalid GitHub Actions SHA registry reference for ${action}`);
      }
      versions.set(sha.toLowerCase(), version);
    }
    actions.set(action.toLowerCase(), versions);
  }
  return actions;
}

async function findWorkflowFiles(root: string): Promise<string[]> {
  const workflowDirectory = resolve(root, ".github", "workflows");

  try {
    const entries = await readdir(workflowDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => resolve(workflowDirectory, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseActionReferences(contents: string): ActionReference[] {
  const references: ActionReference[] = [];

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const match = USES_PATTERN.exec(line);
    const target = match?.[1];
    if (!target || target.startsWith("./") || target.startsWith("docker://")) {
      continue;
    }

    const separator = target.lastIndexOf("@");
    if (separator <= 0 || separator === target.length - 1) {
      continue;
    }

    const comment = match?.[2]?.trim();
    references.push({
      action: target.slice(0, separator).toLowerCase(),
      ref: target.slice(separator + 1),
      ...(comment ? { comment } : {}),
      line: index + 1,
    });
  }

  return references;
}

function majorVersion(ref: string): number | undefined {
  const match = VERSION_PATTERN.exec(ref);
  const value = match?.[1];
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

/** The version a trailing comment declares, or undefined when it is missing or ambiguous. */
function commentVersion(comment: string | undefined): string | undefined {
  if (!comment) return undefined;
  const match = COMMENT_VERSION.exec(comment);
  const version = match?.[1] ?? match?.[2];
  if (!version || !match) return undefined;
  const rest = comment.slice(match[0].length);
  return CONFLICTING_VERSION.test(rest) ? undefined : version;
}

interface ResolvedReference {
  version: string;
  source: "tag" | "comment" | "map";
}

/**
 * Resolves an action reference to the version it pins.
 * - A full commit SHA is classified from its trailing comment when present, then from the bundled
 *   map when the SHA is known. A SHA with neither is left unclassified.
 * - A tag ref is classified from the ref itself; its trailing comment is ignored.
 */
function resolveReference(
  ref: string,
  comment: string | undefined,
  versions: ReadonlyMap<string, string> | undefined,
): ResolvedReference | undefined {
  if (SHA_PATTERN.test(ref)) {
    const version = commentVersion(comment);
    if (version) return { version, source: "comment" };
    if (comment) return undefined;
    const mapped = versions?.get(ref.toLowerCase());
    return mapped ? { version: mapped, source: "map" } : undefined;
  }
  return VERSION_PATTERN.test(ref) ? { version: ref, source: "tag" } : undefined;
}

/**
 * Judges the `dotnet-version` input of `actions/setup-dotnet` with the `dotnet` runtime rules (the same reuse the
 * `container` detector makes for Microsoft base images). A floating or non-literal entry is unclassified, never guessed.
 */
function judgeSetupDotnet(
  contents: string,
  path: string,
  rules: readonly RegistryV2Rule[],
  findings: DetectorFinding[],
  unclassified: DetectorUnclassifiedReference[],
): void {
  for (const entry of setupDotnetVersions(contents)) {
    const location = { path, line: entry.line };
    const reference = `dotnet-version: ${entry.value}`;
    if (entry.expression) {
      unclassified.push({
        component: "actions/setup-dotnet",
        reference,
        reason: "the version is an expression, which Evergreen does not evaluate",
        location,
      });
      continue;
    }
    const version = classifyDotnetVersion(entry.value);
    if (version.kind === "unclassified") {
      unclassified.push({ component: "actions/setup-dotnet", reference, reason: version.reason, location });
      continue;
    }
    const rule = rules.find(
      (item) => versContains(item.vers, version.lowest) && versContains(item.vers, version.highest),
    );
    if (rule) {
      findings.push(
        ruleFinding(
          rule,
          path,
          entry.line,
          `${path} installs .NET ${entry.value} with actions/setup-dotnet. ${rule.summary}`,
        ),
      );
    } else if (
      rules.some((item) => versContains(item.vers, version.lowest) || versContains(item.vers, version.highest))
    ) {
      unclassified.push({
        component: "actions/setup-dotnet",
        reference,
        reason: `"${entry.value}" is a floating release line that spans supported and unsupported versions`,
        location,
      });
    }
  }
}

/**
 * Judges the `node-version` input of `actions/setup-node` with the `nodejs` runtime rules, the same reuse as
 * `judgeSetupDotnet`. A floating, range, or non-literal entry is unclassified, never guessed.
 */
function judgeSetupNode(
  contents: string,
  path: string,
  rules: readonly RegistryV2Rule[],
  findings: DetectorFinding[],
  unclassified: DetectorUnclassifiedReference[],
): void {
  for (const entry of setupNodeVersions(contents)) {
    const location = { path, line: entry.line };
    const reference = `node-version: ${entry.value}`;
    if (entry.expression) {
      unclassified.push({
        component: "actions/setup-node",
        reference,
        reason: "the version is an expression, which Evergreen does not evaluate",
        location,
      });
      continue;
    }
    const version = classifyNodeVersion(entry.value);
    if (version.kind === "unclassified") {
      unclassified.push({ component: "actions/setup-node", reference, reason: version.reason, location });
      continue;
    }
    const rule = rules.find(
      (item) => versContains(item.vers, version.lowest) && versContains(item.vers, version.highest),
    );
    if (rule) {
      findings.push(
        ruleFinding(
          rule,
          path,
          entry.line,
          `${path} installs Node.js ${entry.value} with actions/setup-node. ${rule.summary}`,
        ),
      );
    } else if (
      rules.some((item) => versContains(item.vers, version.lowest) || versContains(item.vers, version.highest))
    ) {
      unclassified.push({
        component: "actions/setup-node",
        reference,
        reason: `"${entry.value}" is a floating release line that spans supported and unsupported versions`,
        location,
      });
    }
  }
}

async function loadRuntimeRules(file: string, purl: string, idPrefix: string): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(await loadDataFile(file)).rules.filter(
    (rule) => rule.purl === purl && rule.id.startsWith(idPrefix),
  );
}

/** A SHA-pinned reference that no comment or bundled map could resolve is reported, not judged. */
export function unresolvedShaReference(
  reference: ActionReference,
  path: string,
): DetectorUnclassifiedReference | undefined {
  if (!SHA_PATTERN.test(reference.ref)) return undefined;
  return {
    component: reference.action,
    reference: reference.ref.toLowerCase(),
    reason: reference.comment ? "invalid-version-comment" : "unknown-sha",
    location: { path, line: reference.line },
  };
}

const VERSION_SOURCE_NOTE: Record<ResolvedReference["source"], string> = {
  comment: " (VERSION from the trailing comment)",
  map: " (VERSION from the bundled SHA map)",
  tag: "",
};

export function outdatedActionFinding(
  reference: ActionReference,
  rule: GitHubActionRule,
  resolved: ResolvedReference,
  path: string,
): DetectorFinding {
  const note = VERSION_SOURCE_NOTE[resolved.source].replace("VERSION", resolved.version);
  return {
    id: `${rule.id}:${path}:${reference.line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${reference.action}@${reference.ref}${note}: ${rule.summary}`,
    severity: rule.severity,
    location: { path, line: reference.line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

export class GitHubActionsDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "github-actions";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { directories: [".github/workflows"], fileNames: ["action.yml", "action.yaml"] };

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const [rules, shaRegistry, workflowFiles] = await Promise.all([
      loadRegistry(),
      loadShaRegistry(),
      findWorkflowFiles(context.root),
    ]);
    let dotnetRules: RegistryV2Rule[] | undefined;
    let nodeRules: RegistryV2Rule[] | undefined;
    const rulesByAction = new Map(rules.map((rule) => [rule.action.toLowerCase(), rule]));
    const findings: DetectorFinding[] = await workflowCommandFindings(context.root);
    const unclassified: DetectorUnclassifiedReference[] = [];

    for (const workflowFile of workflowFiles) {
      const contents = await readFile(workflowFile, "utf8");
      const path = relativePosix(context.root, workflowFile);
      if (/setup-dotnet/i.test(contents)) {
        dotnetRules ??= await loadRuntimeRules("registry/dotnet.json", "pkg:generic/dotnet", "dotnet.runtime.");
        judgeSetupDotnet(contents, path, dotnetRules, findings, unclassified);
      }
      if (/setup-node/i.test(contents)) {
        nodeRules ??= await loadRuntimeRules("registry/nodejs.json", "pkg:generic/nodejs", "nodejs.runtime.");
        judgeSetupNode(contents, path, nodeRules, findings, unclassified);
      }

      for (const reference of parseActionReferences(contents)) {
        const rule = rulesByAction.get(reference.action);
        if (!rule) continue;
        const resolved = resolveReference(reference.ref, reference.comment, shaRegistry.get(reference.action));
        if (!resolved) {
          const skipped = unresolvedShaReference(reference, path);
          if (skipped) unclassified.push(skipped);
          continue;
        }
        const major = majorVersion(resolved.version);
        if (major === undefined || major >= rule.supportedFromMajor) continue;
        findings.push(outdatedActionFinding(reference, rule, resolved, path));
      }
    }

    return { findings, unclassified };
  }

  async scan(context: DetectorContext): Promise<readonly DetectorFinding[]> {
    return (await this.analyze(context)).findings;
  }
}

export const githubActionsDetector = new GitHubActionsDetector();
