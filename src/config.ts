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
    throw new ConfigError(`Unknown key in ${filePath}: "${unknownKeys[0]}" (allowed keys: fail-on, ignore, data-version, baseline).`);
  }

  if (record.schemaVersion !== undefined) {
    if (typeof record.schemaVersion !== "string" || record.schemaVersion !== "evergreen.config.v1") {
      throw new ConfigError(`Invalid schemaVersion in ${filePath}: expected "evergreen.config.v1".`);
    }
  }

  const failOnRaw = record.failOn ?? record["fail-on"];
  let failOn: (Severity | "none") | undefined;
  if (failOnRaw !== undefined) {
    if (typeof failOnRaw !== "string" || (failOnRaw !== "none" && !severityValues.includes(failOnRaw as Severity))) {
      throw new ConfigError(`Invalid severity for fail-on in ${filePath}: "${String(failOnRaw)}" (expected none, ${severityValues.join(", ")}).`);
    }
    failOn = failOnRaw as Severity | "none";
  }

  const dataVersionRaw = record.dataVersion ?? record["data-version"];
  let dataVersion: string | undefined;
  if (dataVersionRaw !== undefined) {
    if (typeof dataVersionRaw !== "string" || dataVersionRaw.trim() === "") {
      throw new ConfigError(`Invalid data-version in ${filePath}: expected non-empty string.`);
    }
    dataVersion = dataVersionRaw.trim();
  }

  const ignoreRaw = record.ignore ?? record.ignorePaths ?? record["ignore-paths"];
  let ignore: string[] | undefined;
  if (ignoreRaw !== undefined) {
    if (typeof ignoreRaw === "string") {
      if (ignoreRaw.trim() === "") throw new ConfigError(`Invalid ignore path in ${filePath}: cannot be empty.`);
      ignore = [ignoreRaw.trim()];
    } else if (Array.isArray(ignoreRaw)) {
      if (ignoreRaw.some((item) => typeof item !== "string" || item.trim() === "")) {
        throw new ConfigError(`Invalid ignore in ${filePath}: expected array of non-empty strings.`);
      }
      ignore = ignoreRaw.map((item) => (item as string).trim());
    } else {
      throw new ConfigError(`Invalid ignore in ${filePath}: expected string or array of strings.`);
    }
  }

  const baselineRaw = record.baseline ?? record.baselines ?? record.baselineFiles ?? record["baseline-files"];
  let baseline: string[] | undefined;
  if (baselineRaw !== undefined) {
    if (typeof baselineRaw === "string") {
      if (baselineRaw.trim() === "") throw new ConfigError(`Invalid baseline path in ${filePath}: cannot be empty.`);
      baseline = [baselineRaw.trim()];
    } else if (Array.isArray(baselineRaw)) {
      if (baselineRaw.some((item) => typeof item !== "string" || item.trim() === "")) {
        throw new ConfigError(`Invalid baseline in ${filePath}: expected array of non-empty file paths.`);
      }
      baseline = baselineRaw.map((item) => (item as string).trim());
    } else {
      throw new ConfigError(`Invalid baseline in ${filePath}: expected file path or array of file paths.`);
    }
  }

  return {
    ...(record.$schema ? { $schema: String(record.$schema) } : {}),
    ...(record.schemaVersion ? { schemaVersion: "evergreen.config.v1" } : {}),
    ...(failOn !== undefined ? { failOn } : {}),
    ...(dataVersion !== undefined ? { dataVersion } : {}),
    ...(ignore !== undefined ? { ignore } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
  };
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
    throw new ConfigError(`Cannot read config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
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
    source += [...segment].map((character) => (character === "*" ? "[^/]*" : character === "?" ? "[^/]" : escapeRegExp(character))).join("");
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
