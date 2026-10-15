import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { DeprecationRule } from "../domain.js";
import { findPackageFile } from "../package-files.js";
import { DETECTOR_API_VERSION, isDeprecationRule } from "../sdk.js";
import { loadRegistryRules } from "../registry.js";
import type { Detector, DetectorContext, DetectorFinding } from "../sdk.js";

interface GitHubActionRule extends DeprecationRule {
  action: string;
  supportedFromMajor: number;
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
  const registryPath = await findPackageFile("registry/github-actions.json", import.meta.url);
  const contents = await readFile(registryPath, "utf8");
  const registry = loadRegistryRules(JSON.parse(contents) as unknown, {
    schemaVersion: "evergreen.github-actions-registry.v1",
    isRule: (value): value is GitHubActionRule =>
      isDeprecationRule(value) &&
      typeof (value as unknown as Record<string, unknown>).action === "string" &&
      typeof (value as unknown as Record<string, unknown>).supportedFromMajor === "number",
  });
  return [...registry.rules];
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
  source: "tag" | "comment";
}

/**
 * Resolves an action reference to the version it pins.
 * - A full commit SHA is classified from its trailing comment only; a SHA with no usable comment
 *   is left unclassified.
 * - A tag ref is classified from the ref itself; its trailing comment is ignored.
 */
function resolveReference(ref: string, comment?: string): ResolvedReference | undefined {
  if (SHA_PATTERN.test(ref)) {
    const version = commentVersion(comment);
    return version ? { version, source: "comment" } : undefined;
  }
  return VERSION_PATTERN.test(ref) ? { version: ref, source: "tag" } : undefined;
}

export class GitHubActionsDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "github-actions";

  async scan(context: DetectorContext): Promise<readonly DetectorFinding[]> {
    const [rules, workflowFiles] = await Promise.all([
      loadRegistry(),
      findWorkflowFiles(context.root),
    ]);
    const rulesByAction = new Map(rules.map((rule) => [rule.action.toLowerCase(), rule]));
    const findings: DetectorFinding[] = [];

    for (const workflowFile of workflowFiles) {
      const contents = await readFile(workflowFile, "utf8");

      for (const reference of parseActionReferences(contents)) {
        const rule = rulesByAction.get(reference.action);
        if (!rule) continue;

        const resolved = resolveReference(reference.ref, reference.comment);
        if (!resolved) continue;

        const major = majorVersion(resolved.version);
        if (major === undefined || major >= rule.supportedFromMajor) {
          continue;
        }

        const path = relative(context.root, workflowFile);
        const summary = resolved.source === "comment"
          ? `${reference.action}@${reference.ref} (${resolved.version} from the trailing comment): ${rule.summary}`
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

    return findings;
  }
}

export const githubActionsDetector = new GitHubActionsDetector();