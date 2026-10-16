import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { relativePosix } from "../paths.js";
import type { DeprecationRule } from "../domain.js";
import { loadDataFile } from "../data-source.js";
import { DETECTOR_API_VERSION, isDeprecationRule } from "../sdk.js";
import { loadRegistryRules } from "../registry.js";
import type {
  Detector,
  DetectorAnalysis,
  DetectorContext,
  DetectorFinding,
  DetectorUnclassifiedReference,
} from "../sdk.js";

interface GitHubActionRule extends DeprecationRule {
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

const USES_PATTERN =
  /^\s*(?:-\s*)?uses\s*:\s*["']?([^\s#"']+)["']?(\s+#.*)?$/;
const VERSION_PATTERN = /^v?(\d+)(?:\.\d+){0,2}$/;
const SHA_PATTERN = /^[a-fA-F0-9]{40}$/;

/**
 * A version declared by a trailing comment on a SHA-pinned reference. The version must start the
 * comment (after the `#` and any whitespace), in one of these forms: `# v4`, `# v4.1`, `# v4.1.1`,
 * `#v4.1.1`, `# 4.1.1`, `# v4.1.1 (pinned for security)`, `# tag=v4.1.1`, or `# version: v4.1.1`.
 * The `(?![.\d])` stopper rejects typos such as `# v4..1` and `# v4.1.1.1`, which would otherwise
 * truncate to a plausible version.
 */
const COMMENT_VERSION =
  /^#\s*(?:(v?\d+(?:\.\d+){0,2})(?![.\d])|(?:tag=|version:\s*)(v?\d+(?:\.\d+){0,2})(?![.\d]))/;

/**
 * A second version token later in the same comment signals conflicting versions (for example
 * `# v3 -> v4`). The `v` prefix is required, so a bare year in a trailing explanation such as
 * `# v4.1.1 (pinned in 2024)` is not mistaken for a version.
 */
const CONFLICTING_VERSION = /\bv\d+(?:\.\d+){0,2}\b/;

async function loadRegistry(): Promise<GitHubActionRule[]> {
  const registry = loadRegistryRules(await loadDataFile("registry/github-actions.json"), {
    schemaVersion: "evergreen.github-actions-registry.v1",
    isRule: (value): value is GitHubActionRule =>
      isDeprecationRule(value) &&
      typeof (value as unknown as Record<string, unknown>).action === "string" &&
      typeof (value as unknown as Record<string, unknown>).supportedFromMajor === "number",
  });
  return [...registry.rules];
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

export class GitHubActionsDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "github-actions";

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const [rules, shaRegistry, workflowFiles] = await Promise.all([
      loadRegistry(),
      loadShaRegistry(),
      findWorkflowFiles(context.root),
    ]);
    const rulesByAction = new Map(rules.map((rule) => [rule.action.toLowerCase(), rule]));
    const findings: DetectorFinding[] = [];
    const unclassified: DetectorUnclassifiedReference[] = [];

    for (const workflowFile of workflowFiles) {
      const contents = await readFile(workflowFile, "utf8");

      for (const reference of parseActionReferences(contents)) {
        const rule = rulesByAction.get(reference.action);
        if (!rule) continue;

        const resolved = resolveReference(
          reference.ref,
          reference.comment,
          shaRegistry.get(reference.action),
        );
        if (!resolved) {
          if (SHA_PATTERN.test(reference.ref)) {
            unclassified.push({
              component: reference.action,
              reference: reference.ref.toLowerCase(),
              reason: reference.comment ? "invalid-version-comment" : "unknown-sha",
              location: {
                path: relativePosix(context.root, workflowFile),
                line: reference.line,
              },
            });
          }
          continue;
        }

        const major = majorVersion(resolved.version);
        if (major === undefined || major >= rule.supportedFromMajor) {
          continue;
        }

        const path = relativePosix(context.root, workflowFile);
        const summary = resolved.source === "comment"
          ? `${reference.action}@${reference.ref} (${resolved.version} from the trailing comment): ${rule.summary}`
          : resolved.source === "map"
            ? `${reference.action}@${reference.ref} (${resolved.version} from the bundled SHA map): ${rule.summary}`
            : `${reference.action}@${reference.ref}: ${rule.summary}`;
        findings.push({
          id: `${rule.id}:${path}:${reference.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary,
          severity: rule.severity,
          location: { path, line: reference.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
        });
      }
    }

    return { findings, unclassified };
  }

  async scan(context: DetectorContext): Promise<readonly DetectorFinding[]> {
    return (await this.analyze(context)).findings;
  }
}

export const githubActionsDetector = new GitHubActionsDetector();
