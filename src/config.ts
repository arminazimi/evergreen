import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { ScanResult, Severity } from "./domain.js";
import { severityValues } from "./domain.js";

export const CONFIG_FILE_NAME = ".evergreen.json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface EvergreenConfig {
  $schema?: string;
  schemaVersion?: string;
  failOn?: Severity | "none";
  ignore?: string[];
  dataVersion?: string;
  baseline?: string[];
  configPath?: string;
}

const CONFIG_SCHEMA_VERSION = "evergreen.config.v1";

export const KNOWN_CONFIG_KEYS = new Set([
  "$schema",
  "schemaVersion",
  "failOn",
  "fail-on",
  "ignore",
  "ignorePaths",
  "ignore-paths",
  "dataVersion",
  "data-version",
  "baseline",
  "baselines",
  "baselineFiles",
  "baseline-files",
]);

/**
 * Validates raw configuration data, ensuring no unknown keys exist and all fields conform to types.
 */
export function validateConfig(raw: unknown, filePath = CONFIG_FILE_NAME): EvergreenConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`Invalid configuration in ${filePath}: expected a JSON object.`);
  }

  const record = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !KNOWN_CONFIG_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ConfigError(
      `Unknown key in ${filePath}: "${unknownKeys[0]}" (allowed keys: fail-on, ignore, data-version, baseline).`,
    );
  }

  if (record.schemaVersion !== undefined && record.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new ConfigError(`Invalid schemaVersion in ${filePath}: expected "${CONFIG_SCHEMA_VERSION}".`);
  }

  const failOn = parseFailOn(firstSetKey(record, ["failOn", "fail-on"]), filePath);
  const dataVersion = parseDataVersion(firstSetKey(record, ["dataVersion", "data-version"]), filePath);
  const ignore = parsePathList(
    firstSetKey(record, ["ignore", "ignorePaths", "ignore-paths"]),
    filePath,
    IGNORE_PROBLEMS,
  );
  const baseline = parsePathList(
    firstSetKey(record, ["baseline", "baselines", "baselineFiles", "baseline-files"]),
    filePath,
    BASELINE_PROBLEMS,
  );

  return {
    ...(record.$schema ? { $schema: String(record.$schema) } : {}),
    ...(record.schemaVersion ? { schemaVersion: CONFIG_SCHEMA_VERSION } : {}),
    ...(failOn !== undefined ? { failOn } : {}),
    ...(dataVersion !== undefined ? { dataVersion } : {}),
    ...(ignore !== undefined ? { ignore } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
  };
}

/** The value under the first of a key's spellings that is set (not absent and not null). */
function firstSetKey(record: Record<string, unknown>, keys: readonly string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

function parseFailOn(raw: unknown, filePath: string): (Severity | "none") | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || (raw !== "none" && !severityValues.includes(raw as Severity))) {
    throw new ConfigError(
      `Invalid severity for fail-on in ${filePath}: "${String(raw)}" (expected none, ${severityValues.join(", ")}).`,
    );
  }
  return raw as Severity | "none";
}

function parseDataVersion(raw: unknown, filePath: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ConfigError(`Invalid data-version in ${filePath}: expected non-empty string.`);
  }
  return raw.trim();
}

/** The wording of each problem a path-list key (`ignore`, `baseline`) can have. */
interface PathListProblems {
  emptyPath: (filePath: string) => string;
  badItem: (filePath: string) => string;
  badShape: (filePath: string) => string;
}

const IGNORE_PROBLEMS: PathListProblems = {
  emptyPath: (filePath) => `Invalid ignore path in ${filePath}: cannot be empty.`,
  badItem: (filePath) => `Invalid ignore in ${filePath}: expected array of non-empty strings.`,
  badShape: (filePath) => `Invalid ignore in ${filePath}: expected string or array of strings.`,
};

const BASELINE_PROBLEMS: PathListProblems = {
  emptyPath: (filePath) => `Invalid baseline path in ${filePath}: cannot be empty.`,
  badItem: (filePath) => `Invalid baseline in ${filePath}: expected array of non-empty file paths.`,
  badShape: (filePath) => `Invalid baseline in ${filePath}: expected file path or array of file paths.`,
};

/** A single path or a list of paths, trimmed. Absent stays absent. */
function parsePathList(raw: unknown, filePath: string, problems: PathListProblems): string[] | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") {
    if (raw.trim() === "") throw new ConfigError(problems.emptyPath(filePath));
    return [raw.trim()];
  }
  if (!Array.isArray(raw)) throw new ConfigError(problems.badShape(filePath));
  if (raw.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ConfigError(problems.badItem(filePath));
  }
  return raw.map((item) => (item as string).trim());
}

/**
 * Searches for .evergreen.json starting in `startDir` and traversing upward until the repository
 * root (.git) or the filesystem root.
 */
export async function findConfigFile(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, CONFIG_FILE_NAME);
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // Continue searching
    }

    try {
      const gitDir = join(current, ".git");
      const gitStats = await stat(gitDir);
      if (gitStats.isDirectory()) {
        break;
      }
    } catch {
      // Not at git root yet
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

/**
 * Loads and validates .evergreen.json for a target project path.
 * Returns undefined if no configuration file exists.
 */
export async function loadConfig(targetPath?: string): Promise<EvergreenConfig | undefined> {
  const startDir = targetPath ? resolve(targetPath) : process.cwd();
  let configPath: string | undefined;

  try {
    const targetStat = await stat(startDir);
    if (targetStat.isFile()) {
      if (basename(startDir) === CONFIG_FILE_NAME) {
        configPath = startDir;
      } else {
        configPath = await findConfigFile(dirname(startDir));
      }
    } else {
      configPath = await findConfigFile(startDir);
    }
  } catch {
    return undefined;
  }

  if (!configPath) return undefined;

  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    throw new ConfigError(
      `Cannot read config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const validated = validateConfig(parsed, configPath);
  const configDir = dirname(configPath);
  const resolvedBaselines = validated.baseline?.map((path) => resolve(configDir, path));

  return {
    ...validated,
    ...(resolvedBaselines ? { baseline: resolvedBaselines } : {}),
    configPath,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * Translates an ignore pattern into a regular expression over repository-relative paths.
 */
export function patternToRegExp(pattern: string): RegExp {
  const directory = pattern.endsWith("/");
  const body = directory ? pattern.slice(0, -1) : pattern;
  const anchored = body.startsWith("/") || body.includes("/");
  const segments = body.replace(/^\//, "").split("/");
  let source = "";
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === "**") {
      source += last ? ".*" : "(?:.*/)?";
      return;
    }
    source += [...segment]
      .map((character) => (character === "*" ? "[^/]*" : character === "?" ? "[^/]" : escapeRegExp(character)))
      .join("");
    if (!last) source += "/";
  });
  const covers = directory ? "/.*" : /[*?]/.test(segments[segments.length - 1] ?? "") ? "" : "(?:/.*)?";
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${source}${covers}$`);
}

/**
 * Checks whether a repository-relative path matches any ignore pattern.
 */
export function matchesIgnorePattern(patterns: readonly string[], filePath: string): boolean {
  const cleanPatterns = patterns.filter((pattern) => pattern.trim().length > 0);
  if (cleanPatterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
  return cleanPatterns.some((pattern) => patternToRegExp(pattern).test(normalized));
}

/**
 * Filters out findings and coverage paths that match any of the given ignore patterns.
 */
export function applyIgnore(result: ScanResult, patterns: readonly string[]): ScanResult {
  const cleanPatterns = patterns.filter((pattern) => pattern.trim().length > 0);
  if (cleanPatterns.length === 0) return result;
  const isIgnored = (path: string) => matchesIgnorePattern(cleanPatterns, path);

  const findings = result.findings.filter((finding) => !isIgnored(finding.location.path));

  let coverage = result.coverage;
  if (coverage) {
    coverage = {
      ...coverage,
      filesRead: coverage.filesRead.filter((path) => !isIgnored(path)),
      unsupportedFiles: coverage.unsupportedFiles.filter((path) => !isIgnored(path)),
    };
  }

  return {
    ...result,
    findings,
    ...(coverage ? { coverage } : {}),
  };
}
