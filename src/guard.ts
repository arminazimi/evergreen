import { spawnSync } from "node:child_process";
import semver from "semver";

import { checkDependency } from "./check-dependency.js";
import type { DependencyCheck } from "./check-dependency.js";
import { severityValues } from "./domain.js";
import type { Severity } from "./domain.js";

/** The severity at or above which a package is refused; `none` never refuses. */
export type GuardGate = Severity | "none";

/** One package argument, resolved to the identity and version Evergreen can judge. */
export interface GuardPackage {
  /** Canonical package URL without a version. */
  purl: string;
  /** The version, or the lower bound of a range, named by the install argument. */
  version?: string;
  /** The argument exactly as written; the package manager receives this. */
  spec: string;
}

/** One raw package-manager argument, marked when it is a registry package to check. */
export interface GuardArgument {
  value: string;
  package?: GuardPackage;
}

/** One package-manager invocation, with its arguments kept in the order the user wrote them. */
export interface GuardRequest {
  command: string;
  arguments: GuardArgument[];
  /** Let the platform shell resolve the command; npm.cmd needs it on Windows. */
  shell?: boolean;
}

export interface GuardCheck {
  package: GuardPackage;
  check?: DependencyCheck;
  error?: string;
}

export interface GuardOptions {
  /** Refuse a package whose highest severity is at or above this value. Defaults to `high`. */
  failOn?: GuardGate;
  /** Run the install even when a package would be refused. */
  override?: boolean;
  /** Lookup used for each package; defaults to the bundled lifecycle rules. */
  check?: (entry: GuardPackage) => Promise<DependencyCheck>;
  /** Package-manager call used when every package is allowed; defaults to running the command. */
  run?: (request: GuardRequest) => number;
  /** Receives a refusal or override warning before the package manager runs. */
  report?: (output: string) => void;
}

export interface GuardResult {
  allowed: boolean;
  exitCode: number;
  checks: GuardCheck[];
  blockers: GuardCheck[];
  /** A refusal, or a warning when `--force` overrode one; empty when the install ran cleanly. */
  output: string;
}

export class GuardUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardUsageError";
  }
}

export interface ParsedGuard {
  request: GuardRequest;
  failOn: GuardGate;
  override: boolean;
}

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));
const npmInstallCommands = new Set(["install", "i", "add"]);
const npmName = /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/;
const npmVersion = /^[A-Za-z0-9._~^<>=*|+ -]+$/;
const npmValueFlags = new Set([
  "-w",
  "--workspace",
  "--prefix",
  "--tag",
  "--cache",
  "--loglevel",
  "--registry",
  "--userconfig",
  "--globalconfig",
  "--location",
  "--save-prefix",
  "--omit",
  "--include",
  "--install-strategy",
  "--also",
  "--os",
  "--cpu",
  "--libc",
  "--scope",
  "--before",
  "--auth-type",
  "--ca",
  "--cafile",
  "--cert",
  "--key",
  "--fetch-retries",
  "--fetch-retry-factor",
  "--fetch-retry-mintimeout",
  "--fetch-retry-maxtimeout",
  "--fetch-timeout",
  "--maxsockets",
  "--proxy",
  "--https-proxy",
  "--noproxy",
  "--script-shell",
  "--node-options",
  "--user-agent",
]);

/** Whether an affected check is severe enough for the gate. */
export function blocksInstall(check: DependencyCheck, failOn: GuardGate = "high"): boolean {
  if (failOn === "none" || check.status !== "affected" || check.severity === undefined) return false;
  return (severityRank.get(check.severity) ?? 0) >= (severityRank.get(failOn) ?? 0);
}

/** Decides whether the install may run. Pure: it performs no lookup and runs nothing. */
export function evaluateGuard(checks: readonly GuardCheck[], options: GuardOptions = {}): { allowed: boolean; blockers: GuardCheck[] } {
  const failOn = options.failOn ?? "high";
  const blockers = checks.filter((entry) => entry.error !== undefined || (entry.check !== undefined && blocksInstall(entry.check, failOn)));
  return { allowed: options.override === true || blockers.length === 0, blockers };
}

/** Looks up every package before anything is installed. A failed lookup blocks rather than guesses. */
export async function checkGuardPackages(packages: readonly GuardPackage[], options: GuardOptions = {}): Promise<GuardCheck[]> {
  const check =
    options.check ??
    ((entry: GuardPackage) => checkDependency({ purl: entry.purl, ...(entry.version === undefined ? {} : { version: entry.version }) }));
  const checks: GuardCheck[] = [];
  for (const entry of packages) {
    try {
      checks.push({ package: entry, check: await check(entry) });
    } catch (error) {
      checks.push({ package: entry, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return checks;
}

function runPackageManager(request: GuardRequest): number {
  const result = spawnSync(
    request.command,
    request.arguments.map((argument) => argument.value),
    {
      stdio: "inherit",
      windowsHide: true,
      ...(request.shell === true ? { shell: true } : {}),
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function requestPackages(request: GuardRequest): GuardPackage[] {
  return request.arguments.flatMap((argument) => (argument.package === undefined ? [] : [argument.package]));
}

function packageLabel(entry: GuardCheck): string {
  return entry.package.version ? `${entry.package.purl}@${entry.package.version}` : entry.package.purl;
}

function renderCheck(entry: GuardCheck): string[] {
  if (entry.error !== undefined) return [`${packageLabel(entry)}: could not check (${entry.error}).`];
  const check = entry.check!;
  if (check.findings.length === 0) return [`${packageLabel(entry)}: ${check.message}`];
  return check.findings.flatMap((finding) => [
    `${packageLabel(entry)} — ${finding.title} (${finding.severity}, ${finding.event})`,
    finding.summary,
    ...(finding.replacement === undefined ? [] : [`Replacement: ${finding.replacement}`]),
    ...(finding.deadline === undefined ? [] : [`Deadline: ${finding.deadline}`]),
    ...finding.sources.map((source) => `Evidence: ${source.url}`),
  ]);
}

function commandLine(request: GuardRequest): string {
  return [request.command, ...request.arguments.map((argument) => argument.value)].join(" ");
}

function renderRefusal(request: GuardRequest, blockers: readonly GuardCheck[], failOn: GuardGate): string {
  return [
    `evergreen guard: refused to run \`${commandLine(request)}\`.`,
    "",
    ...blockers.flatMap(renderCheck),
    "",
    `The install was not run (--fail-on ${failOn}). Review the replacement above, then repeat the command with --force before npm to override.`,
  ].join("\n");
}

function renderOverride(request: GuardRequest, blockers: readonly GuardCheck[]): string {
  return [
    `evergreen guard: running \`${commandLine(request)}\` anyway because --force was given.`,
    "",
    ...blockers.flatMap(renderCheck),
  ].join("\n");
}

/**
 * Checks the requested packages, then runs the package manager only when the gate allows it.
 * The lookup and the runner are injectable so hosts and tests can reuse the policy without a subprocess.
 */
export async function runGuard(request: GuardRequest, options: GuardOptions = {}): Promise<GuardResult> {
  const checks = await checkGuardPackages(requestPackages(request), options);
  const decision = evaluateGuard(checks, options);
  if (!decision.allowed) {
    const output = renderRefusal(request, decision.blockers, options.failOn ?? "high");
    options.report?.(output);
    return { allowed: false, exitCode: 1, checks, blockers: decision.blockers, output };
  }
  const output = decision.blockers.length === 0 ? "" : renderOverride(request, decision.blockers);
  if (output !== "") options.report?.(output);
  const run = options.run ?? runPackageManager;
  return { allowed: true, exitCode: run(request), checks, blockers: decision.blockers, output };
}

/** The version npm would install first, when the spec names one Evergreen can match. */
function checkableVersion(version: string | undefined): string | undefined {
  if (version === undefined) return undefined;
  const trimmed = version.trim();
  if (trimmed === "") return undefined;
  const range = semver.validRange(trimmed);
  return range === null ? undefined : semver.minVersion(range)?.version;
}

function splitNpmSpec(spec: string): { name: string; version?: string } | undefined {
  if (spec === "" || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~")) return undefined;
  // file:, git:, https:, workspace:, npm: aliases and similar non-registry specs are left to npm.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(spec)) return undefined;

  let name: string;
  let version: string | undefined;
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    if (slash <= 1) return undefined;
    const at = spec.indexOf("@", slash + 1);
    name = at === -1 ? spec : spec.slice(0, at);
    version = at === -1 ? undefined : spec.slice(at + 1);
  } else {
    const at = spec.indexOf("@");
    name = at === -1 ? spec : spec.slice(0, at);
    version = at === -1 ? undefined : spec.slice(at + 1);
  }
  if (!npmName.test(name)) return undefined;
  if (version !== undefined && (version === "" || version.includes("/") || version.startsWith("npm:") || !npmVersion.test(version))) return undefined;
  return { name, ...(version === undefined ? {} : { version }) };
}

/** Resolves one npm install argument, or undefined when it is not a registry package spec. */
export function parseNpmPackage(spec: string): GuardPackage | undefined {
  const parsed = splitNpmSpec(spec);
  if (parsed === undefined) return undefined;
  const version = checkableVersion(parsed.version);
  const encodedName = parsed.name.startsWith("@") ? `%40${parsed.name.slice(1)}` : parsed.name;
  return {
    purl: `pkg:npm/${encodedName}`,
    ...(version === undefined ? {} : { version }),
    spec,
  };
}

/**
 * Parses the arguments after `npm`. Every raw argument stays in its original position. Flags are
 * forwarded to npm, and the value after a known value-taking flag is never treated as a package.
 * Local paths, URLs, aliases, and everything after a bare `--` are forwarded unchecked. Registry
 * package specs are judged before npm is called.
 */
export function parseNpmInstall(args: readonly string[]): GuardRequest {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined || !npmInstallCommands.has(subcommand)) {
    throw new GuardUsageError(`Expected \`npm install\`; got \`npm ${subcommand ?? ""}\`.`);
  }

  const argumentsList: GuardArgument[] = [{ value: "install" }];
  let afterTerminator = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (afterTerminator) {
      argumentsList.push({ value: argument });
      continue;
    }
    if (argument === "--") {
      argumentsList.push({ value: argument });
      afterTerminator = true;
      continue;
    }
    if (argument.startsWith("-")) {
      argumentsList.push({ value: argument });
      if (npmValueFlags.has(argument)) {
        const value = rest[index + 1];
        if (value !== undefined) {
          argumentsList.push({ value });
          index += 1;
        }
      }
      continue;
    }
    const entry = parseNpmPackage(argument);
    argumentsList.push(entry === undefined ? { value: argument } : { value: argument, package: entry });
  }

  return { command: "npm", arguments: argumentsList, ...(process.platform === "win32" ? { shell: true } : {}) };
}

/**
 * Parses `evergreen guard [options] <manager> <command>...`. Evergreen consumes `--fail-on`,
 * `--force`, and `--data-version` only before the manager token; anything after it, including
 * `--force`, belongs to the package manager.
 */
export function parseGuardArgs(args: readonly string[]): ParsedGuard {
  let failOn: GuardGate = "high";
  let override = false;
  let index = 0;
  for (; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--fail-on") {
      const value = args[index + 1];
      if (value === undefined || (value !== "none" && !severityValues.includes(value as Severity))) {
        throw new GuardUsageError(`--fail-on needs one of: none, ${severityValues.join(", ")}.`);
      }
      failOn = value as GuardGate;
      index += 1;
    } else if (argument === "--force") {
      override = true;
    } else if (argument === "--data-version") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new GuardUsageError('--data-version needs a version, for example 2026.10.01, or "bundled".');
      }
      index += 1;
    } else {
      break;
    }
  }

  const manager = args[index];
  if (manager === undefined) throw new GuardUsageError("Missing package manager. Use `evergreen guard npm install <package>...`.");
  if (manager !== "npm") throw new GuardUsageError(`Unsupported package manager "${manager}". Today only npm is supported.`);
  return { request: parseNpmInstall(args.slice(index + 1)), failOn, override };
}

/** The CLI entry point: parse, check, and run the package manager only when allowed. */
export async function guardCommand(args: readonly string[], options: GuardOptions = {}): Promise<GuardResult> {
  const parsed = parseGuardArgs(args);
  return runGuard(parsed.request, { ...options, failOn: parsed.failOn, override: parsed.override || options.override === true });
}
