import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { compareVersions, matchesSpecifier, parseVersion, type ParsedVersion } from "./pep440.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

type UnknownRecord = Record<string, unknown>;

/** A target release split the way markers and wheel tags state Python bounds: `3.13` and `3.13.0`. */
interface PythonTarget {
  full: ParsedVersion;
  minor: ParsedVersion;
}

type MinorRelease = readonly [number, number];

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function targetRelease(target: UpgradeTarget): PythonTarget | undefined {
  const parsed = parseVersion(target.version);
  if (!parsed) return undefined;
  const pad = (release: readonly number[], length: number): ParsedVersion => ({
    epoch: 0,
    release: Array.from({ length }, (_unused, index) => release[index] ?? 0),
  });
  return { full: pad(parsed.release, 3), minor: pad(parsed.release.slice(0, 2), 2) };
}

/** The line of each top-level field in every `[[package]]` block, plus the project-level `requires-python` line. */
interface BlockLines {
  fields: Map<string, number>;
  wheelUrls: number[];
}

interface LockLines {
  blocks: BlockLines[];
  pythonRequirement: number | undefined;
}

function scanLines(contents: string): LockLines {
  const blocks: BlockLines[] = [];
  let current: BlockLines | undefined;
  let nested = false;
  let inWheels = false;
  let pythonRequirement: number | undefined;
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "[[package]]") {
      current = { fields: new Map([["__block", line]]), wheelUrls: [] };
      blocks.push(current);
      nested = false;
      inWheels = false;
      continue;
    }
    if (trimmed.startsWith("[")) {
      if (current) nested = true;
      inWheels = false;
      continue;
    }
    if (inWheels) {
      if (trimmed.startsWith("]")) inWheels = false;
      else if (trimmed.includes("url")) current?.wheelUrls.push(line);
      continue;
    }
    if (nested || !current) {
      if (/^requires[_-]python\s*=/.test(trimmed) && pythonRequirement === undefined) pythonRequirement = line;
      continue;
    }
    if (/^wheels\s*=\s*\[$/.test(trimmed)) {
      current.fields.set("wheels", line);
      inWheels = true;
      continue;
    }
    const field = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (field?.[1] && !current.fields.has(field[1])) current.fields.set(field[1], line);
  }
  return { blocks, pythonRequirement };
}

/** PDM groups decide the level; its main group is `default`. uv has no groups, so everything blocks. */
function isMainGroup(groups: unknown): boolean {
  if (!Array.isArray(groups)) return true;
  const names = groups
    .filter((group): group is string => typeof group === "string")
    .map((group) => group.toLowerCase());
  return names.length === 0 || names.includes("default");
}

type BoundVerdict = "allows" | "excludes" | "unknown" | "none";

interface BoundEvidence {
  verdict: BoundVerdict;
  value: string;
  line: number;
}

interface MarkerClause {
  readonly variable: string;
  readonly operator: string;
  readonly version: string;
}

/** Comparison operator to the predicate it applies to `compareVersions`. */
const COMPARATORS: Readonly<Record<string, (comparison: number) => boolean>> = {
  "===": (comparison) => comparison === 0,
  "==": (comparison) => comparison === 0,
  "!=": (comparison) => comparison !== 0,
  ">=": (comparison) => comparison >= 0,
  "<=": (comparison) => comparison <= 0,
  ">": (comparison) => comparison > 0,
  "<": (comparison) => comparison < 0,
};

function holdsComparator(operator: string, comparison: number): boolean {
  const compare = COMPARATORS[operator];
  return compare === undefined ? false : compare(comparison);
}

/** A well-formed Python clause, `"unknown"` for one this matcher cannot read, and undefined for another variable. */
function parseMarkerClause(text: string): MarkerClause | "unknown" | undefined {
  const clause = /^(python_full_version|python_version)\s*(===|==|!=|>=|<=|>|<)\s*(["'])([^"']+)\3$/.exec(text);
  if (clause) return { variable: clause[1] ?? "", operator: clause[2] ?? "", version: clause[4] ?? "" };
  return /^python(_full)?_version\b/.test(text) ? "unknown" : undefined;
}

/** Whether one clause holds for the target, or undefined when either side cannot be read. */
function clauseHolds(clause: MarkerClause, target: PythonTarget | undefined): boolean | undefined {
  const bound = parseVersion(clause.version);
  if (!target || !bound) return undefined;
  const left = clause.variable === "python_full_version" ? target.full : target.minor;
  return holdsComparator(clause.operator, compareVersions(left, bound));
}

/**
 * One `resolution-markers` string is an AND of clauses (uv writes each fork as its own string, an OR).
 * Clauses about other variables (`sys_platform`, `platform_system`) do not bound Python, and a string
 * without any Python clause leaves the resolution open for every release, so it allows.
 */
export function evaluateMarker(marker: string, target: PythonTarget | undefined): BoundVerdict {
  if (/\bor\b|[()]/.test(marker)) return "unknown";
  let sawBound = false;
  let allTrue = true;
  for (const raw of marker.split(/\s+and\s+/)) {
    const clause = parseMarkerClause(raw.trim());
    if (clause === "unknown") return "unknown";
    if (clause === undefined) continue;
    sawBound = true;
    const holds = clauseHolds(clause, target);
    if (holds === undefined) return "unknown";
    if (!holds) allTrue = false;
  }
  return !sawBound || allTrue ? "allows" : "excludes";
}

/**
 * The python tag of a wheel name states a bound only when it names a minor version: `cp39` and
 * `py38` do, `py3` and `py2.py3` do not. Returns undefined for a tag this matcher does not know.
 */
function parsePythonTag(tag: string): "any" | MinorRelease | undefined {
  let bound: MinorRelease | undefined;
  for (const sub of tag.split(".")) {
    if (/^py[23]$/.test(sub) || /^(cp|pp|ipy)\d$/.test(sub)) continue;
    const specific = /^(cp|pp|ipy|py)(\d)(\d+)$/.exec(sub);
    if (!specific) return undefined;
    bound ??= [Number(specific[2]), Number(specific[3])];
  }
  return bound ?? "any";
}

/** Wheel filenames end `-<python tag>-<ABI tag>-<platform tag>`; the tags, not availability, are the bound. */
function wheelPythonTag(
  url: string,
): { tag: string; abi: string; bound: "any" | MinorRelease | undefined } | undefined {
  const name = url
    .split("/")
    .pop()
    ?.replace(/\.whl$/, "");
  if (!name) return undefined;
  const parts = name.split("-");
  if (parts.length < 5) return undefined;
  const tag = parts.at(-3) ?? "";
  const abi = parts.at(-2) ?? "";
  return { tag, abi, bound: parsePythonTag(tag) };
}

function compareMinors(left: MinorRelease, right: MinorRelease): number {
  return left[0] - right[0] || left[1] - right[1];
}

interface KnownWheel {
  tag: string;
  abi: string;
  bound: "any" | MinorRelease;
}

/** The verdict from `resolution-markers`, or undefined when the entry has none to judge. */
function evaluateMarkers(
  markers: unknown,
  lines: BlockLines,
  target: PythonTarget | undefined,
): BoundEvidence | undefined {
  if (markers === undefined) return undefined;
  const markerLine = lines.fields.get("resolution-markers") ?? lines.fields.get("__block") ?? 1;
  if (!Array.isArray(markers) || markers.some((marker) => typeof marker !== "string")) {
    return { verdict: "unknown", value: "resolution-markers", line: markerLine };
  }
  const verdicts = markers.map((marker) => evaluateMarker(marker, target));
  if (verdicts.includes("allows")) return { verdict: "allows", value: "resolution-markers", line: markerLine };
  const unknownMarker = markers[verdicts.indexOf("unknown")];
  if (typeof unknownMarker === "string") {
    return { verdict: "unknown", value: `resolution-markers: ${unknownMarker}`, line: markerLine };
  }
  const excludingMarker = markers[verdicts.indexOf("excludes")];
  if (typeof excludingMarker === "string") {
    return { verdict: "excludes", value: `resolution-markers: ${excludingMarker}`, line: markerLine };
  }
  return undefined;
}

/** Whether one wheel's tag accepts the target: `abi3` accepts that minor and later, others only the exact minor. */
function wheelAllows(bound: KnownWheel, target: PythonTarget | undefined): boolean {
  if (bound.bound === "any") return true;
  if (!target) return false;
  const targetMinor = target.minor.release as MinorRelease;
  return bound.abi === "abi3"
    ? compareMinors(targetMinor, bound.bound) >= 0
    : compareMinors(targetMinor, bound.bound) === 0;
}

/** Reads every wheel's tag, or the first problem that makes the wheels unreadable. */
function readKnownWheels(wheels: unknown[], wheelsLine: number): { known: KnownWheel[] } | { problem: BoundEvidence } {
  const known: KnownWheel[] = [];
  for (const wheel of wheels) {
    const entry = asRecord(wheel);
    if (!entry || typeof entry.url !== "string") {
      return { problem: { verdict: "unknown", value: "wheels", line: wheelsLine } };
    }
    const bound = wheelPythonTag(entry.url);
    if (!bound || bound.bound === undefined) {
      const tag = bound?.tag ?? entry.url.split("/").pop() ?? entry.url;
      return { problem: { verdict: "unknown", value: `wheels: ${tag}`, line: wheelsLine } };
    }
    known.push({ tag: bound.tag, abi: bound.abi, bound: bound.bound });
  }
  return { known };
}

/** Evidence for wheels that all exclude the target, pointing at the first wheel that stated a bound. */
function excludeWheels(known: KnownWheel[], lines: BlockLines, wheelsLine: number): BoundEvidence {
  const tags = [...new Set(known.map((bound) => `${bound.tag}-${bound.abi}`))].sort().join(", ");
  const first = known.findIndex((bound) => bound.bound !== "any");
  const line = (first >= 0 ? lines.wheelUrls[first] : undefined) ?? wheelsLine;
  return { verdict: "excludes", value: `wheels: ${tags}`, line };
}

/** The verdict from wheels, or undefined when the entry has an sdist or no wheels to judge. */
function evaluateWheels(
  record: UnknownRecord,
  lines: BlockLines,
  target: PythonTarget | undefined,
): BoundEvidence | undefined {
  if (record.sdist !== undefined || !Array.isArray(record.wheels)) return undefined;
  const wheelsLine = lines.fields.get("wheels") ?? lines.fields.get("__block") ?? 1;
  const read = readKnownWheels(record.wheels, wheelsLine);
  if ("problem" in read) return read.problem;
  if (read.known.length === 0) return undefined;
  if (read.known.some((bound) => wheelAllows(bound, target))) {
    return { verdict: "allows", value: "wheels", line: lines.fields.get("wheels") ?? 1 };
  }
  return excludeWheels(read.known, lines, wheelsLine);
}

/**
 * An entry is judged from its `resolution-markers`, and from its wheels only when no sdist exists
 * (an sdist builds everywhere, so wheels alone never bound the package). `none` means this file
 * states no Python bound for the entry, and nothing may be reported for it.
 */
export function evaluateEntry(
  record: UnknownRecord,
  lines: BlockLines,
  target: PythonTarget | undefined,
): BoundEvidence {
  const byMarkers = evaluateMarkers(record["resolution-markers"], lines, target);
  if (byMarkers) return byMarkers;
  const byWheels = evaluateWheels(record, lines, target);
  if (byWheels) return byWheels;
  return { verdict: "none", value: "resolution-markers", line: lines.fields.get("__block") ?? 1 };
}

function makeIssue(
  level: UpgradeIssue["level"],
  subject: string,
  path: string,
  line: number | undefined,
  reason: string,
  evidence: UpgradeIssue["evidence"],
): UpgradeIssue {
  return {
    analyzer: "uv-pdm-lock",
    level,
    subject,
    path,
    ...(line === undefined ? {} : { line }),
    reason,
    evidence,
  };
}

type ParsedLock = { document: UnknownRecord | undefined } | { error: UpgradeIssue };

const UV_LOCK = "uv.lock";
const PDM_LOCK = "pdm.lock";

/** A TOML field's text, or undefined when the lockfile states it another way. */
const textField = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const lockEvidence = (value: string): UpgradeIssue["evidence"] => ({ kind: "lockfile", value });

/** A lockfile that does not parse is reported, never guessed at. `field` names the constraint it hides. */
function parseLock(path: string, contents: string, field: string): ParsedLock {
  try {
    return { document: asRecord(parseToml(contents)) };
  } catch {
    return {
      error: makeIssue("unknown", path, path, 1, `${path} is not valid TOML, so ${field} cannot be read.`, {
        kind: "lockfile",
        value: `${path}: invalid TOML`,
      }),
    };
  }
}

/**
 * The project-level constraint of a lockfile. `field` names it in the evidence, `wording` in the reason, because
 * uv writes `requires-python` and PDM writes `[metadata] requires_python`.
 */
function projectIssue(
  path: string,
  field: string,
  wording: string,
  requirement: string,
  line: number | undefined,
  version: string,
): UpgradeIssue | undefined {
  const evidence = lockEvidence(`${field}: ${requirement}`);
  const matches = matchesSpecifier(requirement, version);
  if (matches === undefined)
    return makeIssue(
      "unknown",
      "python",
      path,
      line,
      `Cannot parse the project's ${wording} constraint "${requirement}".`,
      evidence,
    );
  if (matches) return undefined;
  return makeIssue(
    "blocker",
    "python",
    path,
    line,
    `The project's ${wording} "${requirement}" excludes Python ${version}.`,
    evidence,
  );
}

/** One `[[package]]` entry of uv.lock, kept with every other entry resolved for the same name. */
interface UvEntry {
  record: UnknownRecord;
  version: string | undefined;
  lines: BlockLines;
}

const unnamedBlock = (): BlockLines => ({ fields: new Map([["__block", 1]]), wheelUrls: [] });

function uvEntries(packages: unknown[], blocks: BlockLines[]): Map<string, UvEntry[]> {
  const entries = new Map<string, UvEntry[]>();
  for (const [index, value] of packages.entries()) {
    const record = asRecord(value);
    if (!record) continue;
    const name = textField(record.name);
    if (!name) continue;
    const group = entries.get(name) ?? [];
    group.push({ record, version: textField(record.version), lines: blocks[index] ?? unnamedBlock() });
    entries.set(name, group);
  }
  return entries;
}

const MARKERS_PREFIX = "resolution-markers: ";
const WHEELS_PREFIX = "wheels: ";

/** Why an excluding verdict blocks: either the resolution fork or the wheel set leaves the target out. */
function exclusionReason(subject: string, value: string, version: string): string {
  const marker = value.startsWith(MARKERS_PREFIX) ? value.slice(MARKERS_PREFIX.length) : undefined;
  if (marker !== undefined)
    return `${subject} resolves only for Python versions matching "${marker}", which excludes Python ${version}.`;
  return `${subject} has no wheel for Python ${version} and no sdist to fall back on (${value.slice(WHEELS_PREFIX.length)}).`;
}

/** An entry that allows the target, or states no bound at all, keeps the whole package out of the report. */
function allowingVerdict(verdict: BoundVerdict): boolean {
  return verdict === "allows" || verdict === "none";
}

function uvPackageIssue(name: string, group: UvEntry[], target: UpgradeTarget): UpgradeIssue | undefined {
  const verdicts = group.map((entry) => evaluateEntry(entry.record, entry.lines, targetRelease(target)));
  if (verdicts.some((verdict) => allowingVerdict(verdict.verdict))) return undefined;
  const only = group.length === 1 ? group[0] : undefined;
  const subject = only?.version ? `${name}@${only.version}` : name;
  const unknown = verdicts.find((verdict) => verdict.verdict === "unknown");
  if (unknown)
    return makeIssue(
      "unknown",
      subject,
      UV_LOCK,
      unknown.line,
      `Cannot read the Python bounds of ${subject} in uv.lock: ${unknown.value}.`,
      lockEvidence(unknown.value),
    );
  const excluding = verdicts.find((verdict) => verdict.verdict === "excludes");
  if (excluding === undefined) return undefined;
  return makeIssue(
    "blocker",
    subject,
    UV_LOCK,
    excluding.line,
    exclusionReason(subject, excluding.value, target.version),
    lockEvidence(excluding.value),
  );
}

async function analyzeUvLock(root: string, target: UpgradeTarget, issues: UpgradeIssue[]): Promise<void> {
  const contents = await readOptional(resolve(root, UV_LOCK));
  if (contents === undefined) return;
  const parsed = parseLock(UV_LOCK, contents, "requires-python");
  if ("error" in parsed) {
    issues.push(parsed.error);
    return;
  }
  const document = parsed.document;
  const lines = scanLines(contents);

  const requirement = textField(document?.["requires-python"]);
  if (requirement !== undefined) {
    const issue = projectIssue(
      UV_LOCK,
      "requires-python",
      "requires-python",
      requirement,
      lines.pythonRequirement,
      target.version,
    );
    if (issue !== undefined) issues.push(issue);
  }

  const packages = Array.isArray(document?.package) ? document.package : [];
  for (const [name, group] of uvEntries(packages, lines.blocks)) {
    const issue = uvPackageIssue(name, group, target);
    if (issue !== undefined) issues.push(issue);
  }
}

/** The `requires_python` verdict for one PDM package, or nothing when it cannot exclude a target. */
function pdmPackageIssue(value: unknown, line: number | undefined, version: string): UpgradeIssue | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const name = textField(record.name);
  const specifier = textField(record.requires_python);
  if (!name || specifier === undefined) return undefined;
  const packageVersion = textField(record.version);
  const subject = packageVersion ? `${name}@${packageVersion}` : name;

  const evidence = lockEvidence(`requires_python: ${specifier}`);
  const matches = matchesSpecifier(specifier, version);
  if (matches === undefined)
    return makeIssue(
      "unknown",
      subject,
      PDM_LOCK,
      line,
      `Cannot parse the requires_python constraint "${specifier}" for ${subject}.`,
      evidence,
    );
  if (matches) return undefined;

  const main = isMainGroup(record.groups);
  const detail = Array.isArray(record.groups)
    ? record.groups.filter((group) => typeof group === "string").join(", ")
    : "unspecified";
  return makeIssue(
    main ? "blocker" : "warning",
    subject,
    PDM_LOCK,
    line,
    main
      ? `${subject} declares requires_python "${specifier}", which excludes Python ${version}.`
      : `${subject} is in the ${detail} group and its requires_python "${specifier}" excludes Python ${version}.`,
    evidence,
  );
}

async function analyzePdmLock(root: string, target: UpgradeTarget, issues: UpgradeIssue[]): Promise<void> {
  const contents = await readOptional(resolve(root, PDM_LOCK));
  if (contents === undefined) return;
  const parsed = parseLock(PDM_LOCK, contents, "requires_python");
  if ("error" in parsed) {
    issues.push(parsed.error);
    return;
  }
  const document = parsed.document;
  const lines = scanLines(contents);

  const requirement = textField(asRecord(document?.metadata)?.requires_python);
  if (requirement !== undefined) {
    const issue = projectIssue(
      PDM_LOCK,
      "requires_python",
      "[metadata] requires_python",
      requirement,
      lines.pythonRequirement,
      target.version,
    );
    if (issue !== undefined) issues.push(issue);
  }

  const packages = Array.isArray(document?.package) ? document.package : [];
  for (const [index, value] of packages.entries()) {
    const issue = pdmPackageIssue(value, lines.blocks[index]?.fields.get("requires_python"), target.version);
    if (issue !== undefined) issues.push(issue);
  }
}

export class UvPdmLockAnalyzer implements UpgradeAnalyzer {
  readonly id = "uv-pdm-lock";
  readonly runtimes = ["python"] as const;

  async applies(root: string): Promise<boolean> {
    return (
      (await readOptional(resolve(root, UV_LOCK))) !== undefined ||
      (await readOptional(resolve(root, PDM_LOCK))) !== undefined
    );
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    const issues: UpgradeIssue[] = [];
    await analyzeUvLock(root, target, issues);
    await analyzePdmLock(root, target, issues);
    return issues;
  }
}

export const uvPdmLockAnalyzer = new UvPdmLockAnalyzer();
