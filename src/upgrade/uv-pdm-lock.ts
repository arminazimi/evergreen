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

/**
 * One `resolution-markers` string is an AND of clauses (uv writes each fork as its own string, an OR).
 * Clauses about other variables (`sys_platform`, `platform_system`) do not bound Python, and a string
 * without any Python clause leaves the resolution open for every release, so it allows.
 */
function evaluateMarker(marker: string, target: PythonTarget | undefined): BoundVerdict {
  if (/\bor\b|[()]/.test(marker)) return "unknown";
  let sawBound = false;
  let allTrue = true;
  for (const raw of marker.split(/\s+and\s+/)) {
    const text = raw.trim();
    const clause = /^(python_full_version|python_version)\s*(===|==|!=|>=|<=|>|<)\s*(["'])([^"']+)\3$/.exec(text);
    if (!clause) {
      if (/^python(_full)?_version\b/.test(text)) return "unknown";
      continue;
    }
    sawBound = true;
    const bound = parseVersion(clause[4] ?? "");
    if (!target || !bound) return "unknown";
    const left = clause[1] === "python_full_version" ? target.full : target.minor;
    const comparison = compareVersions(left, bound);
    const holds =
      clause[2] === "===" || clause[2] === "=="
        ? comparison === 0
        : clause[2] === "!="
          ? comparison !== 0
          : clause[2] === ">="
            ? comparison >= 0
            : clause[2] === "<="
              ? comparison <= 0
              : clause[2] === ">"
                ? comparison > 0
                : comparison < 0;
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

/**
 * An entry is judged from its `resolution-markers`, and from its wheels only when no sdist exists
 * (an sdist builds everywhere, so wheels alone never bound the package). `none` means this file
 * states no Python bound for the entry, and nothing may be reported for it.
 */
function evaluateEntry(record: UnknownRecord, lines: BlockLines, target: PythonTarget | undefined): BoundEvidence {
  const markers = record["resolution-markers"];
  if (markers !== undefined) {
    const markerLine = lines.fields.get("resolution-markers") ?? lines.fields.get("__block") ?? 1;
    if (!Array.isArray(markers) || markers.some((marker) => typeof marker !== "string")) {
      return { verdict: "unknown", value: "resolution-markers", line: markerLine };
    }
    const verdicts = markers.map((marker) => evaluateMarker(marker, target));
    if (verdicts.includes("allows")) return { verdict: "allows", value: "resolution-markers", line: markerLine };
    const unknownMarker = markers[verdicts.indexOf("unknown")];
    if (typeof unknownMarker === "string")
      return { verdict: "unknown", value: `resolution-markers: ${unknownMarker}`, line: markerLine };
    const excludingMarker = markers[verdicts.indexOf("excludes")];
    if (typeof excludingMarker === "string") {
      return { verdict: "excludes", value: `resolution-markers: ${excludingMarker}`, line: markerLine };
    }
  }

  if (record.sdist === undefined && Array.isArray(record.wheels)) {
    const known: Array<{ tag: string; abi: string; bound: "any" | MinorRelease }> = [];
    for (const wheel of record.wheels) {
      const entry = asRecord(wheel);
      if (!entry || typeof entry.url !== "string") {
        return {
          verdict: "unknown",
          value: "wheels",
          line: lines.fields.get("wheels") ?? lines.fields.get("__block") ?? 1,
        };
      }
      const bound = wheelPythonTag(entry.url);
      if (!bound || bound.bound === undefined) {
        const tag = bound?.tag ?? entry.url.split("/").pop() ?? entry.url;
        return {
          verdict: "unknown",
          value: `wheels: ${tag}`,
          line: lines.fields.get("wheels") ?? lines.fields.get("__block") ?? 1,
        };
      }
      known.push({ tag: bound.tag, abi: bound.abi, bound: bound.bound });
    }
    if (known.length > 0) {
      const allows = known.some((bound) => {
        if (bound.bound === "any") return true;
        if (!target) return false;
        return bound.abi === "abi3"
          ? compareMinors(target.minor.release as MinorRelease, bound.bound) >= 0
          : compareMinors(target.minor.release as MinorRelease, bound.bound) === 0;
      });
      if (allows) return { verdict: "allows", value: "wheels", line: lines.fields.get("wheels") ?? 1 };
      const tags = [...new Set(known.map((bound) => `${bound.tag}-${bound.abi}`))].sort().join(", ");
      const first = known.findIndex((bound) => bound.bound !== "any");
      return {
        verdict: "excludes",
        value: `wheels: ${tags}`,
        line:
          (first >= 0 ? lines.wheelUrls[first] : undefined) ??
          lines.fields.get("wheels") ??
          lines.fields.get("__block") ??
          1,
      };
    }
  }

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

async function analyzeUvLock(root: string, target: UpgradeTarget, issues: UpgradeIssue[]): Promise<void> {
  const contents = await readOptional(resolve(root, "uv.lock"));
  if (contents === undefined) return;
  let document: UnknownRecord | undefined;
  try {
    document = asRecord(parseToml(contents));
  } catch {
    issues.push(
      makeIssue("unknown", "uv.lock", "uv.lock", 1, "uv.lock is not valid TOML, so requires-python cannot be read.", {
        kind: "lockfile",
        value: "uv.lock: invalid TOML",
      }),
    );
    return;
  }

  const lines = scanLines(contents);
  const requirement = typeof document?.["requires-python"] === "string" ? document["requires-python"] : undefined;
  if (requirement !== undefined) {
    const matches = matchesSpecifier(requirement, target.version);
    if (matches === undefined) {
      issues.push(
        makeIssue(
          "unknown",
          "python",
          "uv.lock",
          lines.pythonRequirement,
          `Cannot parse the project's requires-python constraint "${requirement}".`,
          {
            kind: "lockfile",
            value: `requires-python: ${requirement}`,
          },
        ),
      );
    } else if (!matches) {
      issues.push(
        makeIssue(
          "blocker",
          "python",
          "uv.lock",
          lines.pythonRequirement,
          `The project's requires-python "${requirement}" excludes Python ${target.version}.`,
          {
            kind: "lockfile",
            value: `requires-python: ${requirement}`,
          },
        ),
      );
    }
  }

  const packages = Array.isArray(document?.package) ? document.package : [];
  const entries = new Map<string, Array<{ record: UnknownRecord; version: string | undefined; lines: BlockLines }>>();
  for (const [index, value] of packages.entries()) {
    const record = asRecord(value);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name : undefined;
    if (!name) continue;
    const version = typeof record.version === "string" ? record.version : undefined;
    const block = lines.blocks[index] ?? { fields: new Map([["__block", 1]]), wheelUrls: [] };
    const group = entries.get(name) ?? [];
    group.push({ record, version, lines: block });
    entries.set(name, group);
  }

  for (const [name, group] of entries) {
    const verdicts = group.map((entry) => evaluateEntry(entry.record, entry.lines, targetRelease(target)));
    if (verdicts.some((verdict) => verdict.verdict === "allows" || verdict.verdict === "none")) continue;
    const subject = group.length === 1 && group[0]?.version ? `${name}@${group[0].version}` : name;
    const unknown = verdicts.find((verdict) => verdict.verdict === "unknown");
    if (unknown) {
      issues.push(
        makeIssue(
          "unknown",
          subject,
          "uv.lock",
          unknown.line,
          `Cannot read the Python bounds of ${subject} in uv.lock: ${unknown.value}.`,
          {
            kind: "lockfile",
            value: unknown.value,
          },
        ),
      );
      continue;
    }
    const excluding = verdicts.find((verdict) => verdict.verdict === "excludes");
    if (!excluding) continue;
    const marker = excluding.value.startsWith("resolution-markers: ")
      ? excluding.value.slice("resolution-markers: ".length)
      : undefined;
    const reason = marker
      ? `${subject} resolves only for Python versions matching "${marker}", which excludes Python ${target.version}.`
      : `${subject} has no wheel for Python ${target.version} and no sdist to fall back on (${excluding.value.slice("wheels: ".length)}).`;
    issues.push(
      makeIssue("blocker", subject, "uv.lock", excluding.line, reason, { kind: "lockfile", value: excluding.value }),
    );
  }
}

async function analyzePdmLock(root: string, target: UpgradeTarget, issues: UpgradeIssue[]): Promise<void> {
  const contents = await readOptional(resolve(root, "pdm.lock"));
  if (contents === undefined) return;
  let document: UnknownRecord | undefined;
  try {
    document = asRecord(parseToml(contents));
  } catch {
    issues.push(
      makeIssue(
        "unknown",
        "pdm.lock",
        "pdm.lock",
        1,
        "pdm.lock is not valid TOML, so requires_python cannot be read.",
        {
          kind: "lockfile",
          value: "pdm.lock: invalid TOML",
        },
      ),
    );
    return;
  }

  const lines = scanLines(contents);
  const metadata = asRecord(document?.metadata);
  const requirement = typeof metadata?.requires_python === "string" ? metadata.requires_python : undefined;
  if (requirement !== undefined) {
    const matches = matchesSpecifier(requirement, target.version);
    if (matches === undefined) {
      issues.push(
        makeIssue(
          "unknown",
          "python",
          "pdm.lock",
          lines.pythonRequirement,
          `Cannot parse the project's [metadata] requires_python constraint "${requirement}".`,
          {
            kind: "lockfile",
            value: `requires_python: ${requirement}`,
          },
        ),
      );
    } else if (!matches) {
      issues.push(
        makeIssue(
          "blocker",
          "python",
          "pdm.lock",
          lines.pythonRequirement,
          `The project's [metadata] requires_python "${requirement}" excludes Python ${target.version}.`,
          {
            kind: "lockfile",
            value: `requires_python: ${requirement}`,
          },
        ),
      );
    }
  }

  const packages = Array.isArray(document?.package) ? document.package : [];
  for (const [index, value] of packages.entries()) {
    const record = asRecord(value);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name : undefined;
    const version = typeof record.version === "string" ? record.version : undefined;
    const specifier = typeof record.requires_python === "string" ? record.requires_python : undefined;
    if (!name || specifier === undefined) continue;
    const subject = version ? `${name}@${version}` : name;
    const line = lines.blocks[index]?.fields.get("requires_python");
    const matches = matchesSpecifier(specifier, target.version);
    if (matches === undefined) {
      issues.push(
        makeIssue(
          "unknown",
          subject,
          "pdm.lock",
          line,
          `Cannot parse the requires_python constraint "${specifier}" for ${subject}.`,
          {
            kind: "lockfile",
            value: `requires_python: ${specifier}`,
          },
        ),
      );
      continue;
    }
    if (matches) continue;
    const main = isMainGroup(record.groups);
    const groups = Array.isArray(record.groups)
      ? record.groups.filter((group) => typeof group === "string").join(", ")
      : "unspecified";
    issues.push(
      makeIssue(
        main ? "blocker" : "warning",
        subject,
        "pdm.lock",
        line,
        main
          ? `${subject} declares requires_python "${specifier}", which excludes Python ${target.version}.`
          : `${subject} is in the ${groups} group and its requires_python "${specifier}" excludes Python ${target.version}.`,
        { kind: "lockfile", value: `requires_python: ${specifier}` },
      ),
    );
  }
}

export class UvPdmLockAnalyzer implements UpgradeAnalyzer {
  readonly id = "uv-pdm-lock";
  readonly runtimes = ["python"] as const;

  async applies(root: string): Promise<boolean> {
    return (
      (await readOptional(resolve(root, "uv.lock"))) !== undefined ||
      (await readOptional(resolve(root, "pdm.lock"))) !== undefined
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
