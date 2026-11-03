import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node, YAMLMap } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { MAXIMUM_INPUT_BYTES, PINNED_ELIXIR_VERSION, PINNED_ERLANG_VERSION, elixirVersion, otpFromElixirPin } from "../detectors/elixir/parse-elixir-runtime.js";
import { parseMixExs } from "../detectors/elixir/parse-mix-exs.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Elixir and Erlang/OTP version a repository states, as two runtimes, with file and line.
 *
 * Elixir pins come from `.elixir-version`, `.tool-versions` `elixir` lines (keeping the asdf `-otp-NN`
 * suffix in the value as written), Dockerfile and Containerfile `FROM elixir:<tag>` and
 * `FROM hexpm/elixir:<elixir>-erlang-<otp>-<os>` lines, the `elixir-version` input of `erlef/setup-beam`
 * workflows, and `elixir` and `hexpm/elixir` images in GitLab CI and CircleCI. The `mix.exs` `elixir:`
 * constraint is a floor. Erlang pins come from `.tool-versions` `erlang` lines, the `otp-version` input
 * of `erlef/setup-beam`, and the OTP half of any Elixir version that names one: an `-otp-NN` suffix or a
 * `hexpm/elixir` tag, so one `hexpm/elixir` line feeds both collectors. Elixir is compared at
 * `major.minor` (`1.16`), OTP at its major (`26`).
 *
 * The Elixir detector's runtime and `mix.exs` parsers and bounded input limits are reused unchanged;
 * `.tool-versions` and `.elixir-version` lines keep their text as written because the detector parser
 * strips the OTP suffix. Nothing is evaluated, executed, fetched, or written; values that cannot be
 * resolved offline are reported with the reason.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "deps", "_build", ".elixir_ls", "fixtures", "__fixtures__", "testdata"]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const WORKFLOW_NAME = /\.ya?ml$/i;
const SETUP_BEAM = /^erlef\/setup-beam@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;

/** An `elixir` image tag: `<version>[-otp-<otp>][-variant]`, such as `1.16.3-otp-26.2.5-alpine`. */
const ELIXIR_IMAGE_TAG = /^([1-9][0-9]*\.[0-9]+(?:\.\d+)*)(?:(-otp-)([1-9][0-9]*(?:\.\d+)*))?((?:[-+][0-9A-Za-z._-]+)?)$/;
/** The `hexpm/elixir:<elixir>-erlang-<otp>-<os>` build tag. */
const HEXPM_IMAGE_TAG = /^([1-9][0-9]*\.[0-9]+(?:\.\d+)*)-erlang-([1-9][0-9]*(?:\.\d+)*)(?:-[0-9A-Za-z][0-9A-Za-z._-]*)?$/;
/** The lower bound of a `mix.exs` constraint, such as `~> 1.15` or `>= 1.15.7`. */
const FLOOR_BOUND = /(?:~>|>=|==|>)\s*([1-9][0-9]*)\.([0-9]+)/;
/** A setup-beam `otp-version`, which may carry the `OTP-` prefix, such as `OTP-26.2.5`. */
const OTP_INPUT = /^(?:OTP-)?([1-9][0-9]*(?:\.\d+)*)$/;
/** The trailing asdf OTP suffix of an Elixir version as written, such as `-otp-26`. */
const OTP_SUFFIX = /-otp-[1-9][0-9]*(?:\.\d+)*$/;

const SOURCE_ELIXIR_VERSION = ".elixir-version";
const SOURCE_TOOL_VERSIONS = ".tool-versions";
const SOURCE_MIX_EXS = "mix.exs elixir";
const SOURCE_SETUP_ELIXIR = "GitHub Actions erlef/setup-beam elixir-version";
const SOURCE_SETUP_OTP = "GitHub Actions erlef/setup-beam otp-version";
const SOURCE_SETUP_ELIXIR_MATRIX = "setup-beam elixir matrix";
const SOURCE_SETUP_OTP_MATRIX = "setup-beam otp matrix";
const SOURCE_GITLAB = "GitLab CI image";
const SOURCE_CIRCLECI = "CircleCI image";

type ElixirFileKind = "elixir-version" | "tool-versions" | "mix" | "dockerfile" | "workflow" | "gitlab" | "circleci";

interface ElixirFile {
  kind: ElixirFileKind;
  path: string;
}

/** The pins of both runtimes, collected in one repository walk. */
interface ElixirPins {
  elixir: RuntimePin[];
  erlang: RuntimePin[];
}

/** What a value resolves to offline: the release line it selects, or the reason it selects none. */
type Resolved = { release: string } | { unresolved: string };

function fileKind(name: string, directory: string): ElixirFileKind | undefined {
  if (name === ".elixir-version") return "elixir-version";
  if (name === ".tool-versions") return "tool-versions";
  if (name === "mix.exs") return "mix";
  if (DOCKERFILE_NAME.test(name)) return "dockerfile";
  if (name === ".gitlab-ci.yml") return "gitlab";
  if (name === "config.yml" && basename(directory) === ".circleci") return "circleci";
  if (WORKFLOW_NAME.test(name) && basename(directory) === "workflows" && basename(dirname(directory)) === ".github") return "workflow";
  return undefined;
}

async function elixirFiles(root: string): Promise<ElixirFile[]> {
  const files: ElixirFile[] = [];
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
      } else if (entry.isFile()) {
        const kind = fileKind(entry.name, directory);
        if (kind) files.push({ kind, path: join(directory, entry.name) });
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The `major.minor` release line of an Elixir pin such as `1.16.2-otp-26`; undefined when it is not one. */
function elixirReleaseOf(value: string): string | undefined {
  if (!PINNED_ELIXIR_VERSION.test(value)) return undefined;
  return majorMinor(elixirVersion(value));
}

/** The first two dotted components of a version as `major.minor`. */
function majorMinor(version: string): string | undefined {
  const parts = version.split(".");
  return parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined ? `${parts[0]}.${parts[1]}` : undefined;
}

/** The OTP major of an Erlang pin such as `26.2.5`; undefined when it is not one. */
function erlangReleaseOf(value: string): string | undefined {
  return PINNED_ERLANG_VERSION.test(value) ? value.split(".")[0] : undefined;
}

/** The OTP major a setup-beam `otp-version` selects, including its `OTP-` form. */
function otpInputReleaseOf(value: string): string | undefined {
  return OTP_INPUT.exec(value.trim())?.[1]?.split(".")[0];
}

/** The lowest release a literal `mix.exs` constraint admits, from its first lower bound. */
function floorRelease(value: string): string | undefined {
  const bound = FLOOR_BOUND.exec(value);
  if (bound?.[1] !== undefined && bound[2] !== undefined) return `${bound[1]}.${bound[2]}`;
  return elixirReleaseOf(value);
}

function makePin(path: string, line: number, source: string, raw: string, kind: "pin" | "floor", resolved: Resolved, group?: string): RuntimePin {
  return { path, line, source, raw, kind, ...(group === undefined ? {} : { group }), ...resolved };
}

/** The asdf OTP suffix of a version as written, such as `-otp-26`; empty when there is none. */
function otpSuffix(value: string): string {
  return OTP_SUFFIX.exec(value)?.[0] ?? "";
}

function collectElixirVersionFile(contents: string, path: string, pins: ElixirPins): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    const release = elixirReleaseOf(value);
    pins.elixir.push(makePin(path, index + 1, SOURCE_ELIXIR_VERSION, value, "pin",
      release === undefined ? { unresolved: `"${value}" is not an Elixir version Evergreen reads` } : { release }));
    pushOtpDerived(path, index + 1, SOURCE_ELIXIR_VERSION, value, otpFromElixirPin(value), pins);
  }
}

/** The OTP major named by an Elixir value that carries one is also an Erlang pin. */
function pushOtpDerived(path: string, line: number, source: string, raw: string, otpMajor: string | undefined, pins: ElixirPins): void {
  if (otpMajor === undefined) return;
  pins.erlang.push(makePin(path, line, source, raw, "pin", { release: otpMajor }));
}

/**
 * `.tool-versions` lines keep their tokens as written because the detector parser strips the asdf
 * `-otp-NN` suffix; drift reports the suffix as part of the Elixir pin and derives the Erlang pin from it.
 */
function collectToolVersions(contents: string, path: string, pins: ElixirPins): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const text = rawLine.replace(/#.*$/, "").trim();
    const [tool, ...values] = text.split(/\s+/);
    const line = index + 1;
    if (tool === "elixir") {
      for (const value of values) {
        const release = elixirReleaseOf(value);
        pins.elixir.push(makePin(path, line, SOURCE_TOOL_VERSIONS, value, "pin",
          release === undefined ? { unresolved: `"${value}" is not an Elixir version Evergreen reads` } : { release }));
        pushOtpDerived(path, line, SOURCE_TOOL_VERSIONS, value, otpFromElixirPin(value), pins);
      }
    } else if (tool === "erlang") {
      for (const value of values) {
        const release = erlangReleaseOf(value);
        pins.erlang.push(makePin(path, line, SOURCE_TOOL_VERSIONS, value, "pin",
          release === undefined ? { unresolved: `"${value}" is not an Erlang/OTP version Evergreen reads` } : { release }));
      }
    }
  }
}

function collectMixExs(contents: string, path: string, pins: ElixirPins): void {
  for (const declaration of parseMixExs(contents)) {
    if (declaration.kind !== "elixir") continue;
    const release = floorRelease(declaration.value);
    pins.elixir.push(makePin(path, declaration.line, SOURCE_MIX_EXS, declaration.value, "floor",
      release === undefined ? { unresolved: `"${declaration.value}" states no minimum Elixir release` } : { release }));
  }
}

function isElixirImage(image: ImageReference): boolean {
  return image.registry === "docker.io" && (image.repository === "library/elixir" || image.repository === "hexpm/elixir");
}

/** The `major.minor` of a version an image tag regex captured; a missing capture is reported unresolved. */
function capturedElixirRelease(version: string | undefined, tag: string): Resolved {
  const release = version === undefined ? undefined : majorMinor(version);
  return release === undefined ? { unresolved: `"${tag}" does not name an Elixir release` } : { release };
}

/** One `elixir` or `hexpm/elixir` image reference, feeding both runtimes when the tag names an OTP version. */
function imagePins(value: string, line: number, source: string, path: string, pins: ElixirPins): void {
  const image = parseImageReference(value);
  if (!image || !isElixirImage(image)) return;
  const tag = image.tag;
  if (tag === undefined) {
    pins.elixir.push({ path, line, source, raw: value, kind: "pin", unresolved: "the image reference has no tag" });
    return;
  }
  if (image.repository === "hexpm/elixir") {
    const match = HEXPM_IMAGE_TAG.exec(tag);
    if (match === null) {
      pins.elixir.push(makePin(path, line, source, tag, "pin", { unresolved: `"${tag}" is not a hexpm/elixir tag Evergreen reads` }));
      return;
    }
    pins.elixir.push(makePin(path, line, source, tag, "pin", capturedElixirRelease(match[1], tag)));
    pushOtpDerived(path, line, source, tag, match[2]?.split(".")[0], pins);
    return;
  }
  const match = ELIXIR_IMAGE_TAG.exec(tag);
  if (match === null) {
    pins.elixir.push(makePin(path, line, source, tag, "pin", { unresolved: `"${tag}" does not name an Elixir release` }));
    return;
  }
  pins.elixir.push(makePin(path, line, source, tag, "pin", capturedElixirRelease(match[1], tag)));
  pushOtpDerived(path, line, source, tag, match[3]?.split(".")[0], pins);
}

function collectDockerfile(contents: string, path: string, pins: ElixirPins): void {
  const name = path.slice(path.lastIndexOf("/") + 1);
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "image") imagePins(declaration.value, declaration.line, `${name} FROM`, path, pins);
  }
}

function imagePinsAll(references: ReadonlyArray<{ value: string; line: number }>, source: string, path: string, pins: ElixirPins): void {
  for (const reference of references) imagePins(reference.value, reference.line, source, path, pins);
}

/** The text a scalar was written as: YAML reads `1.16` as the number 1.16, so numbers use their source. */
function textOf(node: Node): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

interface SetupBeamInput {
  input: "elixir-version" | "otp-version";
  value: string;
  line: number;
  expression: boolean;
  matrix: boolean;
}

function readSetupBeamInput(inputs: YAMLMap, name: SetupBeamInput["input"], matrix: unknown, lineOf: (node: Node) => number, found: SetupBeamInput[]): void {
  const node = inputs.get(name, true) as Node | null;
  if (!node || !isScalar(node)) return;
  const key = typeof node.value === "string" ? MATRIX_REFERENCE.exec(node.value.trim())?.[1] : undefined;
  const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
  const add = (item: Node, isMatrix: boolean): void => {
    const value = textOf(item);
    if (value !== undefined && value !== "") found.push({ input: name, value, line: lineOf(item), expression: value.includes("${{"), matrix: isMatrix });
  };
  if (isSeq(list)) for (const item of list.items) add(item as Node, true);
  else add(node, false);
}

function setupBeamInputs(contents: string): SetupBeamInput[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const lineOf = (node: Node): number => lineCounter.linePos(node.range?.[0] ?? 0).line;

  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const found: SetupBeamInput[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const strategy = job.value.get("strategy", true);
    const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) {
      if (!isMap(step)) continue;
      const uses = step.get("uses");
      if (typeof uses !== "string" || !SETUP_BEAM.test(uses)) continue;
      const inputs = step.get("with", true);
      if (!isMap(inputs)) continue;
      readSetupBeamInput(inputs, "elixir-version", matrix, lineOf, found);
      readSetupBeamInput(inputs, "otp-version", matrix, lineOf, found);
    }
  }
  return found;
}

function elixirResolved(value: string): Resolved {
  const release = elixirReleaseOf(value);
  return release === undefined ? { unresolved: `"${value}" is not an Elixir version Evergreen reads` } : { release };
}

function otpVersionResolved(value: string): Resolved {
  const release = otpInputReleaseOf(value);
  return release === undefined ? { unresolved: `"${value}" is not an Erlang/OTP version Evergreen reads` } : { release };
}

function collectWorkflow(contents: string, path: string, pins: ElixirPins): void {
  for (const entry of setupBeamInputs(contents)) {
    const isElixir = entry.input === "elixir-version";
    const target = isElixir ? pins.elixir : pins.erlang;
    const source = isElixir ? SOURCE_SETUP_ELIXIR : SOURCE_SETUP_OTP;
    const matrixSource = isElixir ? SOURCE_SETUP_ELIXIR_MATRIX : SOURCE_SETUP_OTP_MATRIX;
    const resolved = entry.expression
      ? { unresolved: `"${entry.value}" is an expression, which Evergreen does not evaluate` }
      : isElixir ? elixirResolved(entry.value) : otpVersionResolved(entry.value);
    target.push(makePin(path, entry.line, entry.matrix ? matrixSource : source, entry.value, "pin", resolved,
      entry.matrix ? matrixSource : undefined));
  }
}

async function collectAll(root: string): Promise<ElixirPins> {
  const pins: ElixirPins = { elixir: [], erlang: [] };
  for (const file of await elixirFiles(root)) {
    let contents: string;
    try {
      contents = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    const path = relativePosix(root, file.path);
    if (file.kind === "elixir-version") collectElixirVersionFile(contents, path, pins);
    else if (file.kind === "tool-versions") collectToolVersions(contents, path, pins);
    else if (file.kind === "mix") collectMixExs(contents, path, pins);
    else if (file.kind === "dockerfile") collectDockerfile(contents, path, pins);
    else if (file.kind === "workflow") collectWorkflow(contents, path, pins);
    else if (file.kind === "gitlab") imagePinsAll(parseGitlabCi(contents).unclassified, SOURCE_GITLAB, path, pins);
    else imagePinsAll(parseCircleci(contents).declarations, SOURCE_CIRCLECI, path, pins);
  }
  return pins;
}

/** Rewrites the `:<tag>` at the pin's line to `:<newTag>`, refusing image digests. */
function alignImageTag(pin: RuntimePin, lineText: string, newTag: string): string | undefined {
  if (lineText.includes("@sha256:")) return undefined;
  const at = lineText.indexOf(`:${pin.raw}`);
  if (at === -1) return undefined;
  return `${lineText.slice(0, at)}:${newTag}${lineText.slice(at + 1 + pin.raw.length)}`;
}

function isImageSource(source: string): boolean {
  return source.endsWith(" FROM") || source === SOURCE_GITLAB || source === SOURCE_CIRCLECI;
}

/** A hexpm/elixir tag is refused everywhere here: choosing its OS part is a decision, not a rewrite. */
function elixirImageMatch(pin: RuntimePin): RegExpExecArray | null {
  return pin.raw.includes("-erlang-") ? null : ELIXIR_IMAGE_TAG.exec(pin.raw);
}

function alignElixirImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = elixirImageMatch(pin);
  if (match === null || match[1] === undefined) return undefined;
  return alignImageTag(pin, lineText, `${release}${match[2] ?? ""}${match[3] ?? ""}${match[4] ?? ""}`);
}

function alignErlangImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = elixirImageMatch(pin);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) return undefined;
  return alignImageTag(pin, lineText, `${match[1]}${match[2]}${release}${match[4] ?? ""}`);
}

function alignElixir(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind === "floor" || !/^\d+\.\d+$/.test(release)) return undefined;

  if (pin.source === SOURCE_ELIXIR_VERSION) {
    const match = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[2] === pin.raw ? `${match[1]}${release}${otpSuffix(pin.raw)}${match[3]}` : undefined;
  }

  if (pin.source === SOURCE_TOOL_VERSIONS) {
    const match = /^(\s*elixir\s+)([^\s#]+)(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[2] === pin.raw ? `${match[1]}${release}${otpSuffix(pin.raw)}${match[3]}` : undefined;
  }

  if (pin.source === SOURCE_SETUP_ELIXIR) {
    const match = /^(\s*(?:-\s*)?elixir-version\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[3] === pin.raw ? `${match[1]}${match[2]}${release}${match[2]}${match[4]}` : undefined;
  }

  if (isImageSource(pin.source)) return alignElixirImage(pin, lineText, release);

  return undefined;
}

/** Rewrites the OTP suffix of an Elixir value as written (`1.17-otp-25`) to the given OTP major. */
function alignOtpSuffix(pin: RuntimePin, lineText: string, release: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(lineText);
  if (match === null || match[2] === undefined || match[3] === undefined || match[4] === undefined) return undefined;
  if (`${match[2]}${match[3]}${match[4]}` !== pin.raw) return undefined;
  return `${match[1]}${match[2]}${match[3]}${release}${match[5] ?? ""}`;
}

function alignErlang(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind === "floor" || !/^\d+$/.test(release)) return undefined;

  if (pin.source === SOURCE_TOOL_VERSIONS) {
    const erlangLine = /^(\s*erlang\s+)([^\s#]+)(\s*(?:#.*)?)$/.exec(lineText);
    if (erlangLine !== null && erlangLine[2] === pin.raw) return `${erlangLine[1]}${release}${erlangLine[3]}`;
    return alignOtpSuffix(pin, lineText, release, /^(\s*elixir\s+)(\S+?)(-otp-)([1-9][0-9]*(?:\.\d+)*)(\s*(?:#.*)?)$/);
  }

  if (pin.source === SOURCE_ELIXIR_VERSION) {
    return alignOtpSuffix(pin, lineText, release, /^(\s*)(\S+?)(-otp-)([1-9][0-9]*(?:\.\d+)*)(\s*(?:#.*)?)$/);
  }

  if (pin.source === SOURCE_SETUP_OTP) {
    const match = /^(\s*(?:-\s*)?otp-version\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[3] === pin.raw ? `${match[1]}${match[2]}${release}${match[2]}${match[4]}` : undefined;
  }

  if (isImageSource(pin.source)) return alignErlangImage(pin, lineText, release);

  return undefined;
}

export const elixirDriftCollector: DriftCollector = {
  runtime: "elixir",
  async collect(root: string): Promise<RuntimePin[]> {
    return (await collectAll(root)).elixir;
  },
  align: alignElixir,
};

export const erlangDriftCollector: DriftCollector = {
  runtime: "erlang",
  async collect(root: string): Promise<RuntimePin[]> {
    return (await collectAll(root)).erlang;
  },
  align: alignErlang,
};
