import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { loadDataFile } from "@velella/ebb/data-source";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import type { Finding } from "../domain.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import { required } from "../required.js";
import type { FilePatch, Fixer, Refuse } from "./types.js";

const DOCKERFILE = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const FROM_LINE = /^(\s*FROM\s+(?:--[^\s]+\s+)*)([^\s]+)(.*)$/i;
/** A tag named in prose, such as `node:22` in "such as node:22"; URLs and digests do not carry a tag this matches. */
const NAMED_TAG = /(?<![A-Za-z0-9._/-])([a-z0-9][a-z0-9._/-]*):([A-Za-z0-9][A-Za-z0-9_.-]{0,127})(?![A-Za-z0-9_.-])/g;
const RELEASE_TAG = /^(\d+(?:\.\d+){0,2})(.*)$/;

interface ImageEdit {
  /** The reference the finding reported, parsed from its summary. */
  current: ImageReference;
  /** The tag the rule names, without the repository. */
  target: string;
}

interface Targets {
  lines: Map<number, ImageEdit>;
  findings: Finding[];
}

/** The image a finding's summary reports, or undefined for a finding that does not name one (a rootfs or RUN install). */
function reportedImage(finding: Finding): ImageReference | undefined {
  const marker = " uses ";
  const start = finding.summary.indexOf(marker);
  if (start < 0) return undefined;
  const rest = finding.summary.slice(start + marker.length);
  const end = rest.indexOf(". ");
  return end < 0 ? undefined : parseImageReference(rest.slice(0, end));
}

/** The distro parts of a tag suffix, ignoring versions: `20-alpine3.19` and `22-alpine3.20` share `["alpine"]`. */
function distroFamily(tag: string): string[] | undefined {
  const suffix = RELEASE_TAG.exec(tag)?.[2];
  if (suffix === undefined) return undefined;
  return suffix
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.replace(/[\d.]+$/, ""));
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The one tag the rule names for this image, or why there is no single safe target. A replacement that names no tag,
 * names several, or names a tag for another image is ambiguous; a tag in a different distro family would change the
 * base operating system, which the rule does not cover; and an older tag is not a repair.
 */
function rewriteTarget(finding: Finding, current: ImageReference): { tag: string } | { reason: string } {
  const named = [...(finding.replacement ?? "").matchAll(NAMED_TAG)].flatMap((match) => {
    const parsed = parseImageReference(`${match[1]}:${match[2]}`);
    return parsed?.tag !== undefined && parsed.registry === current.registry && parsed.repository === current.repository
      ? [parsed.tag]
      : [];
  });
  const [target, ...others] = [...new Set(named)];
  if (target === undefined)
    return {
      reason: "The rule's replacement does not name a tag for this image.",
    };
  if (others.length > 0)
    return {
      reason: "The rule's replacement names more than one tag; the target is ambiguous.",
    };

  if (current.tag === undefined) return { reason: "The image has no tag to rewrite." };
  const currentParts = RELEASE_TAG.exec(current.tag);
  const targetParts = RELEASE_TAG.exec(target);
  if (!currentParts || !targetParts) return { reason: "The image tag does not name a release line." };
  const currentFamily = distroFamily(current.tag);
  const targetFamily = distroFamily(target);
  if (currentFamily?.join("-") !== targetFamily?.join("-")) {
    return {
      reason: `The rule's replacement tag "${target}" is not in the same distro family as "${current.tag}".`,
    };
  }
  const currentVersion = currentParts[1];
  const targetVersion = targetParts[1];
  if (currentVersion === undefined || targetVersion === undefined)
    return { reason: "The image tag does not name a release line." };
  if (compareVersions(targetVersion, currentVersion) <= 0) {
    return {
      reason: `The rule's replacement tag "${target}" is not newer than the current tag "${current.tag}".`,
    };
  }
  return { tag: target };
}

/** The tag on `line` is replaced only while the line still names the image the finding reported. */
function rewriteFrom(line: string, edit: ImageEdit): string {
  const match = FROM_LINE.exec(line);
  const token = match?.[2];
  if (!match || token === undefined) return line;
  const image = parseImageReference(token);
  if (!image || !sameImage(image, edit.current) || image.tag === undefined) return line;
  return `${match[1]}${token.slice(0, token.lastIndexOf(":") + 1)}${edit.target}${match[3]}`;
}

function sameImage(left: ImageReference, right: ImageReference): boolean {
  return (
    left.registry === right.registry &&
    left.repository === right.repository &&
    left.tag === right.tag &&
    left.digest === right.digest
  );
}

/** The refusal for a finding whose line the edit left unchanged, or undefined when there is nothing to report. */
function refusalFor(
  finding: Finding,
  original: readonly string[],
  updated: readonly string[],
  lines: ReadonlyMap<number, ImageEdit>,
): string | undefined {
  const line = finding.location.line;
  if (line === undefined) return undefined;
  const edit = lines.get(line);
  if (edit === undefined) return undefined;
  const index = line - 1;
  return updated[index] === original[index] ? lineRefusal(original[index], edit) : undefined;
}

/** Why the line was left as it is, or undefined when it still carries the image the finding names. */
function lineRefusal(line: string | undefined, edit: ImageEdit): string | undefined {
  if (line === undefined) return "The finding names no line to rewrite.";
  const match = FROM_LINE.exec(line);
  const token = match?.[2];
  if (!match || token === undefined) return "The line is not a `FROM` instruction.";
  const image = parseImageReference(token);
  if (!image) return "The line's image reference could not be parsed.";
  if (!sameImage(image, edit.current)) return "The line no longer holds the image the finding names.";
  return undefined;
}

/**
 * A line whose announced end of life is still ahead is supported today: the scan notes the date, and moving it early
 * is a choice, not a repair. The event decides, not the clock (decision 0010); the rule becomes fixable once it is
 * promoted to `end-of-life`. These are the registries the container detector reports Dockerfile images from.
 */
async function scheduledRuleIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const file of ["registry/container.json", "registry/dotnet.json"]) {
    for (const rule of validateRegistryV2(await loadDataFile(file)).rules) {
      if (rule.event === "scheduled-end-of-life") ids.add(rule.id);
    }
  }
  return ids;
}

/**
 * Rewrites the tag of a Dockerfile or Containerfile `FROM` base image when the finding's rule names exactly one
 * successor tag in the same distro family. Digest-pinned images, floating lines, Compose and devcontainer images, and
 * every ambiguous case are left alone and reported through `refuse` with the reason.
 */
export const dockerfileBaseImageFixer: Fixer = {
  id: "dockerfile",
  async plan(result, refuse) {
    const targets = await dockerfileTargets(result.findings, refuse);
    const patches: FilePatch[] = [];
    for (const [path, target] of [...targets].sort(([a], [b]) => a.localeCompare(b))) {
      const patch = await planFile(result.root, path, target, refuse);
      if (patch !== undefined) patches.push(patch);
    }
    return patches;
  },
};

/** The Dockerfiles that carry a fixable image finding, each with the tag edit per line; unfixable findings are refused. */
async function dockerfileTargets(
  findings: readonly Finding[],
  refuse: Refuse | undefined,
): Promise<Map<string, Targets>> {
  let scheduled: Promise<Set<string>> | undefined;
  const targets = new Map<string, Targets>();
  for (const finding of findings) {
    if (finding.detector !== "container" || !DOCKERFILE.test(basename(finding.location.path))) continue;
    const current = reportedImage(finding);
    // A root filesystem or a RUN install names no FROM line; runtime pins have their own fixer.
    if (!current) continue;
    if ((await (scheduled ??= scheduledRuleIds())).has(finding.ruleId)) continue;
    const edit = editFor(finding, current, refuse);
    if (edit === undefined) continue;
    const entry: Targets = targets.get(finding.location.path) ?? {
      lines: new Map(),
      findings: [],
    };
    entry.lines.set(required(finding.location.line, "the finding line"), edit);
    entry.findings.push(finding);
    targets.set(finding.location.path, entry);
  }
  return targets;
}

/** The tag edit for one finding, or undefined when it cannot be rewritten exactly; the reason is reported through `refuse`. */
function editFor(finding: Finding, current: ImageReference, refuse: Refuse | undefined): ImageEdit | undefined {
  if (finding.location.line === undefined) {
    refuse?.(finding, "The finding names no line to rewrite.");
    return undefined;
  }
  if (current.digest !== undefined) {
    refuse?.(
      finding,
      "The image is pinned by digest; rewriting the tag would leave the digest pointing at the old image.",
    );
    return undefined;
  }
  const target = rewriteTarget(finding, current);
  if ("reason" in target) {
    refuse?.(finding, target.reason);
    return undefined;
  }
  return { current, target: target.tag };
}

/** The rewritten Dockerfile patch, or undefined when no `FROM` line changes; declined and unchanged findings are reported. */
async function planFile(
  root: string,
  path: string,
  { lines, findings }: Targets,
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const decline = (reason: string): undefined => {
    for (const finding of findings) refuse?.(finding, reason);
    return undefined;
  };
  const absolute = resolve(root, path);
  const inside = relative(resolve(root), absolute);
  if (inside.startsWith("..") || isAbsolute(inside)) return decline("The path resolves outside the repository.");
  const before = await readFile(absolute, "utf8").catch(() => undefined);
  if (before === undefined) return decline("The Dockerfile could not be read.");
  if (!before.endsWith("\n")) return decline("The Dockerfile does not end with a newline.");

  const original = before.split("\n");
  const text = original
    .map((line, index) => {
      const edit = lines.get(index + 1);
      return edit ? rewriteFrom(line, edit) : line;
    })
    .join("\n");
  // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
  const patch =
    text === before
      ? undefined
      : {
          path,
          diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)),
        };
  const updated = text.split("\n");
  for (const finding of findings) {
    const reason = refusalFor(finding, original, updated, lines);
    if (reason !== undefined) refuse?.(finding, reason);
  }
  return patch;
}
