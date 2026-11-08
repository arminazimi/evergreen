import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import semver from "semver";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Scalar, YAMLMap } from "yaml";

import { parseGlobalJson } from "../detectors/dotnet/parse-global-json.js";
import { parseJavaVersion } from "../detectors/java/parse-pins.js";
import { parsePhpVersion } from "../detectors/php/parse-php-runtime.js";
import { parseRubyVersion } from "../detectors/ruby/parse-ruby-runtime.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { addDays } from "@velella/ebb/forecast";
import { lookupProduct } from "@velella/ebb/lookup";
import type { LookupFinding, LookupResult } from "@velella/ebb/lookup";
import { readPinnedRuntimes } from "../runtime-pin.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

/**
 * Target lifecycle analyzer: judges the target release itself and lists the pins that must change.
 *
 * A target whose bundled rules say it is end-of-life or out of support is a `blocker`; one that ends within
 * `SOON_ENDING_DAYS` days of the given day is a `warning`. Both name the newest supported line from the bundled
 * data (the rule's replacement) and carry the rule id as evidence. Separately, every file that pins the target
 * runtime to a version other than the target is listed as a `warning` with subject `pin to update`, at its exact
 * path and line. The repository is read only; nothing here uses the network, and `global.json`, `Dockerfile`, and
 * workflow files are parsed, never evaluated or executed.
 */

export const TARGET_LIFECYCLE_RUNTIMES = ["nodejs", "python", "go", "java", "dotnet", "ruby", "php", "dart"] as const;

const SUPPORTED_RUNTIMES = new Set<string>(TARGET_LIFECYCLE_RUNTIMES);

/** A target whose dated end falls within this many days of the checked day is a warning. */
export const SOON_ENDING_DAYS = 180;

const ANALYZER_ID = "target-lifecycle";

const RUNTIME_LABELS: Record<string, string> = {
  nodejs: "Node.js",
  python: "Python",
  go: "Go",
  java: "Java",
  dotnet: ".NET",
  ruby: "Ruby",
  php: "PHP",
  dart: "Dart",
};

/** One pin of one runtime, with the exact place it is written. */
export interface RuntimePin {
  runtime: string;
  path: string;
  line: number;
  /** The version as written in the file. */
  value: string;
  /** The normalized `major.minor.patch` the pin stands for. */
  normalized: string;
  /** The field label carried in the issue evidence, such as `nvmrc` or `actions/setup-node`. */
  field: string;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The normalized version of a pin text, or undefined when it names no concrete version (`lts/*`, `latest`). */
function normalizePin(value: string): string | undefined {
  const coerced = semver.coerce(value);
  return coerced === null ? undefined : coerced.version;
}

/** The count of leading numeric components of a target version: `22` is 1, `3.13` is 2, `8.4.0` is 3. */
export function targetPrecision(version: string): number {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version);
  if (!match) return 0;
  return match[3] !== undefined ? 3 : match[2] !== undefined ? 2 : 1;
}

/** True when the pin does not name the target release line at the precision the target was written with. */
export function pinDiffersFromTarget(pin: RuntimePin, target: UpgradeTarget): boolean {
  const need = semver.coerce(target.version);
  if (need === null) return true;
  const precision = targetPrecision(target.version);
  const pinParts = pin.normalized.split(".");
  const needParts = need.version.split(".");
  for (let index = 0; index < precision; index += 1) {
    if (pinParts[index] !== needParts[index]) return true;
  }
  return false;
}

const SINGLE_LINE_PINS = [
  { path: ".nvmrc", runtime: "nodejs", field: "nvmrc" },
  { path: ".node-version", runtime: "nodejs", field: "node-version" },
  { path: ".python-version", runtime: "python", field: "python-version" },
] as const;

/** The first meaningful line of a simple pin file, skipping blanks and comments. */
function firstVersionLine(contents: string): { value: string; line: number; normalized: string } | undefined {
  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine === undefined) continue;
    const text = rawLine.trim();
    if (text === "" || text.startsWith("#")) continue;
    const normalized = normalizePin(text);
    return normalized === undefined ? undefined : { value: text, line: index + 1, normalized };
  }
  return undefined;
}

const ASDF_TOOLS: Record<string, string> = {
  node: "nodejs",
  nodejs: "nodejs",
  python: "python",
  python2: "python",
  ruby: "ruby",
  java: "java",
  golang: "go",
  go: "go",
  php: "php",
  dart: "dart",
  dotnet: "dotnet",
  "dotnet-core": "dotnet",
};

/** The first concrete version of every recognized tool line of a `.tool-versions` file. */
export function toolVersionPins(contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const text = (rawLine.split("#", 1)[0] ?? "").trim();
    if (text === "") continue;
    const parts = text.split(/\s+/);
    const tool = parts[0] ?? "";
    const runtime = ASDF_TOOLS[tool.toLowerCase()];
    if (runtime === undefined) continue;
    const value = parts.slice(1).find((candidate) => !/^(?:path|ref):/i.test(candidate));
    if (value === undefined) continue;
    const normalized = normalizePin(value);
    if (normalized === undefined) continue;
    pins.push({ runtime, path: ".tool-versions", line: index + 1, value, normalized, field: `.tool-versions ${tool}` });
  }
  return pins;
}

const DOCKER_IMAGE_REPOSITORIES: Record<string, string> = {
  "library/node": "nodejs",
  "library/python": "python",
  "library/ruby": "ruby",
  "library/php": "php",
  "library/golang": "go",
  "library/dart": "dart",
  "library/openjdk": "java",
  "library/temurin": "java",
  "library/eclipse-temurin": "java",
  "library/amazoncorretto": "java",
  "dotnet/sdk": "dotnet",
  "dotnet/aspnet": "dotnet",
  "dotnet/runtime": "dotnet",
  "dotnet/core/sdk": "dotnet",
  "dotnet/core/aspnet": "dotnet",
  "dotnet/core/runtime": "dotnet",
};

/** The runtime one literal image reference pins through its repository and tag, if it pins any supported runtime. */
export function imagePin(reference: string, line: number, path: string): RuntimePin | undefined {
  const image = parseImageReference(reference);
  if (image === undefined || image.tag === undefined) return undefined;
  const runtime = DOCKER_IMAGE_REPOSITORIES[image.repository];
  if (runtime === undefined) return undefined;
  const normalized = normalizePin(image.tag);
  if (normalized === undefined) return undefined;
  return { runtime, path, line, value: reference, normalized, field: "FROM" };
}

const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const WALK_SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "vendor",
  ".venv",
  "__pycache__",
]);
const MAXIMUM_DOCKERFILE_FILES = 32;
const MAXIMUM_DOCKERFILE_DEPTH = 4;

/** Every Dockerfile and Containerfile in the repository, bounded and sorted, as root-relative paths. */
async function dockerfilePathTree(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string, relativeDirectory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DOCKERFILE_DEPTH || found.length >= MAXIMUM_DOCKERFILE_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isFile() && DOCKERFILE_NAME.test(entry.name)) {
        found.push(relative);
        if (found.length >= MAXIMUM_DOCKERFILE_FILES) return;
        continue;
      }
      if (entry.isDirectory() && !WALK_SKIP_DIRECTORIES.has(entry.name)) {
        await walk(join(directory, entry.name), relative, depth + 1);
      }
    }
  }
  await walk(root, "", 0);
  return found;
}

async function dockerfilePins(root: string): Promise<RuntimePin[]> {
  const pins: RuntimePin[] = [];
  for (const path of await dockerfilePathTree(root)) {
    const contents = await readOptional(join(root, path));
    if (contents === undefined) continue;
    for (const declaration of parseDockerfile(contents)) {
      if (declaration.kind !== "image") continue;
      const pin = imagePin(declaration.value, declaration.line, path);
      if (pin !== undefined) pins.push(pin);
    }
  }
  return pins;
}

const SETUP_ACTION = /^actions\/setup-([a-z]+)@/i;
const SETUP_ACTION_RUNTIMES: Record<string, string> = {
  node: "nodejs",
  python: "python",
  ruby: "ruby",
  java: "java",
  dotnet: "dotnet",
  go: "go",
  dart: "dart",
};

/** The text a scalar was written as; YAML reads `16.10` as the number 16.1, so numbers use their source. */
function scalarText(node: Scalar): string | undefined {
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** The runtime a `uses:` value selects through a recognized `actions/setup-*` action, or undefined. */
function setupAction(uses: unknown): { runtime: string; suffix: string } | undefined {
  const suffix = typeof uses === "string" ? SETUP_ACTION.exec(uses)?.[1]?.toLowerCase() : undefined;
  const runtime = suffix === undefined ? undefined : SETUP_ACTION_RUNTIMES[suffix];
  return suffix === undefined || runtime === undefined ? undefined : { runtime, suffix };
}

/** The pin one version-entry scalar carries, or undefined when it names no concrete version. */
function versionPin(
  runtime: string,
  field: string,
  path: string,
  entry: unknown,
  lineAt: (node: Scalar) => number,
): RuntimePin | undefined {
  if (!isScalar(entry)) return undefined;
  const text = scalarText(entry);
  const normalized = text === undefined ? undefined : normalizePin(text);
  if (text === undefined || normalized === undefined) return undefined;
  return { runtime, path, line: lineAt(entry), value: text, normalized, field };
}

/** The pins one workflow step carries through its setup action's `<suffix>-version` input, scalar or list. */
function stepPins(step: YAMLMap, path: string, lineAt: (node: Scalar) => number): RuntimePin[] {
  const action = setupAction(step.get("uses"));
  if (action === undefined) return [];
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return [];
  const version = inputs.get(`${action.suffix}-version`, true);
  if (version === null || version === undefined) return [];
  const field = `actions/setup-${action.suffix}`;
  const pins: RuntimePin[] = [];
  const entries: readonly unknown[] = isSeq(version) ? version.items : [version];
  for (const entry of entries) {
    const pin = versionPin(action.runtime, field, path, entry, lineAt);
    if (pin !== undefined) pins.push(pin);
  }
  return pins;
}

/** The runtime one workflow file pins through `actions/setup-*` version inputs, one pin per version listed. */
export function workflowPins(path: string, contents: string): RuntimePin[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const lineAt = (node: Scalar): number => lineCounter.linePos(node.range?.[0] ?? 0).line;
  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const pins: RuntimePin[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) {
      if (!isMap(step)) continue;
      pins.push(...stepPins(step, path, lineAt));
    }
  }
  return pins;
}

async function workflowFilePins(root: string): Promise<RuntimePin[]> {
  const directory = join(root, ".github", "workflows");
  let entries: string[];
  try {
    entries = (await readdir(directory)).filter((name) => /\.(?:ya?ml)$/i.test(name)).sort();
  } catch {
    return [];
  }
  const pins: RuntimePin[] = [];
  for (const name of entries) {
    const contents = await readOptional(join(directory, name));
    if (contents === undefined) continue;
    pins.push(...workflowPins(`.github/workflows/${name}`, contents));
  }
  return pins;
}

/** Versioned pins from an existing detector parser, which all return `{ value, line }` declarations. */
function parserPins(
  path: string,
  runtime: string,
  contents: string | undefined,
  parse: (contents: string) => readonly { value: string; line: number }[],
): RuntimePin[] {
  if (contents === undefined) return [];
  const pins: RuntimePin[] = [];
  for (const declaration of parse(contents)) {
    const normalized = normalizePin(declaration.value);
    if (normalized === undefined) continue;
    pins.push({
      runtime,
      path,
      line: declaration.line,
      value: declaration.value,
      normalized,
      field: path.replace(/^\./, ""),
    });
  }
  return pins;
}

/** Every versioned pin of a supported runtime the analyzer can read, sorted by path and line. */
export async function readRuntimePins(root: string): Promise<RuntimePin[]> {
  const pins: RuntimePin[] = [];
  for (const spec of SINGLE_LINE_PINS) {
    const contents = await readOptional(join(root, spec.path));
    if (contents === undefined) continue;
    const found = firstVersionLine(contents);
    if (found !== undefined)
      pins.push({
        runtime: spec.runtime,
        path: spec.path,
        line: found.line,
        value: found.value,
        normalized: found.normalized,
        field: spec.field,
      });
  }
  pins.push(
    ...parserPins(".ruby-version", "ruby", await readOptional(join(root, ".ruby-version")), parseRubyVersion),
    ...parserPins(".php-version", "php", await readOptional(join(root, ".php-version")), parsePhpVersion),
    ...parserPins(".java-version", "java", await readOptional(join(root, ".java-version")), parseJavaVersion),
    ...parserPins("global.json", "dotnet", await readOptional(join(root, "global.json")), parseGlobalJson),
  );
  const toolContents = await readOptional(join(root, ".tool-versions"));
  if (toolContents !== undefined) pins.push(...toolVersionPins(toolContents));
  pins.push(...(await dockerfilePins(root)));
  pins.push(...(await workflowFilePins(root)));
  return pins.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.field.localeCompare(right.field) ||
      left.value.localeCompare(right.value),
  );
}

/** The rule-id prefix that marks a runtime's own lifecycle rules in the bundled registry. */
const RUNTIME_RULE_PREFIXES: Record<string, string> = {
  nodejs: "nodejs.runtime.",
  python: "python.runtime.",
  go: "go.runtime.",
  java: "java.jdk.",
  dotnet: "dotnet.runtime.",
  ruby: "ruby.runtime.",
  php: "php.runtime.",
  dart: "dart.sdk.",
};

/** The precedence used by `src/lookup.ts` to name one status for a whole product. */
const STATUS_PRECEDENCE = ["end-of-life", "removed", "end-of-support", "deprecated", "scheduled-end-of-life"] as const;

/**
 * The finding that speaks about the runtime release itself. `lookupProduct` aggregates every rule of the resolved
 * product, which can include module or platform rules, so only the product's own lifecycle rules judge the target.
 */
function primaryFinding(runtime: string, findings: readonly LookupFinding[]): LookupFinding | undefined {
  const prefix = RUNTIME_RULE_PREFIXES[runtime];
  if (prefix === undefined) return undefined;
  const own = findings.filter((finding) => finding.ruleId.startsWith(prefix));
  for (const event of STATUS_PRECEDENCE) {
    const finding = own.find((candidate) => candidate.event === event);
    if (finding !== undefined) return finding;
  }
  return undefined;
}

/** The lifecycle issue for the target itself, or undefined when the bundled data does not flag it on `today`. */
export function targetLifecycleIssue(
  target: UpgradeTarget,
  findings: readonly LookupFinding[],
  today: string,
): UpgradeIssue | undefined {
  const primary = primaryFinding(target.runtime, findings);
  if (primary === undefined) return undefined;
  const deadline = primary.deadline;
  const outOfSupport = primary.event === "end-of-support";
  const ended =
    primary.event === "end-of-life" ||
    primary.event === "removed" ||
    outOfSupport ||
    (deadline !== undefined && deadline <= today);
  if (!ended && (deadline === undefined || deadline > addDays(today, SOON_ENDING_DAYS))) return undefined;
  const suggestion = primary.replacement ?? "a newer supported line named by the bundled lifecycle data";
  const subject = `${target.runtime}@${target.version}`;
  if (ended) {
    return {
      analyzer: ANALYZER_ID,
      level: "blocker",
      subject,
      path: "",
      reason: outOfSupport
        ? `The target itself is out of support; choose ${suggestion}.`
        : `The target itself is end-of-life; choose ${suggestion}.`,
      evidence: { kind: "rule", value: primary.ruleId },
    };
  }
  return {
    analyzer: ANALYZER_ID,
    level: "warning",
    subject,
    path: "",
    reason: `The target itself ends on ${deadline}, within ${SOON_ENDING_DAYS} days; choose ${suggestion}.`,
    evidence: { kind: "rule", value: primary.ruleId },
  };
}

/** One `pin to update` warning per pin that does not already name the target release. */
export function pinIssues(pins: readonly RuntimePin[], target: UpgradeTarget): UpgradeIssue[] {
  const label = RUNTIME_LABELS[target.runtime] ?? target.runtime;
  return pins
    .filter((pin) => pin.runtime === target.runtime && pinDiffersFromTarget(pin, target))
    .map((pin) => ({
      analyzer: ANALYZER_ID,
      level: "warning" as const,
      subject: "pin to update",
      path: pin.path,
      line: pin.line,
      reason: `${pin.path} still pins ${label} ${pin.value}; update it to the target ${target.version}.`,
      evidence: { kind: "manifest" as const, value: `${pin.field}: ${pin.value}` },
    }));
}

/** The full report for one root, on an explicit day so the answer never depends on a hidden clock. */
export async function analyzeTargetLifecycle(
  root: string,
  target: UpgradeTarget,
  today: string,
): Promise<UpgradeIssue[]> {
  if (!SUPPORTED_RUNTIMES.has(target.runtime)) return [];
  const pins = (await readRuntimePins(root)).filter((pin) => pin.runtime === target.runtime);
  const first = pins[0];
  if (first === undefined) return [];
  const issues: UpgradeIssue[] = [];
  let result: LookupResult | undefined;
  try {
    result = await lookupProduct(target.runtime, target.version);
  } catch {
    result = undefined;
  }
  if (result !== undefined) {
    const lifecycle = targetLifecycleIssue(target, result.findings, today);
    if (lifecycle !== undefined) issues.push({ ...lifecycle, path: first.path, line: first.line });
  }
  issues.push(...pinIssues(pins, target));
  return issues;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class TargetLifecycleAnalyzer implements UpgradeAnalyzer {
  readonly id = ANALYZER_ID;
  readonly runtimes = TARGET_LIFECYCLE_RUNTIMES;

  async applies(root: string): Promise<boolean> {
    if (Object.keys(await readPinnedRuntimes(root)).length > 0) return true;
    return (await readRuntimePins(root)).length > 0;
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    return analyzeTargetLifecycle(root, target, today());
  }
}

export const targetLifecycleAnalyzer = new TargetLifecycleAnalyzer();
