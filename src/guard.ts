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

/** One package-manager invocation, with package arguments kept apart from the fixed ones. */
export interface GuardRequest {
  command: string;
  args: string[];
  packages: GuardPackage[];
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
  const result = spawnSync(request.command, [...request.args, ...request.packages.map((entry) => entry.spec)], {
    stdio: "inherit",
    windowsHide: true,
    ...(request.shell === true ? { shell: true } : {}),
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
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

function renderRefusal(request: GuardRequest, blockers: readonly GuardCheck[], failOn: GuardGate): string {
  const command = [request.command, ...request.args].join(" ");
  return [
    `evergreen guard: refused to run \`${command}\`.`,
    "",
    ...blockers.flatMap(renderCheck),
    "",
    `The install was not run (--fail-on ${failOn}). Review the replacement above, then repeat the command with --force to override.`,
  ].join("\n");
}

function renderOverride(request: GuardRequest, blockers: readonly GuardCheck[]): string {
  const command = [request.command, ...request.args].join(" ");
  return [
    `evergreen guard: running \`${command}\` anyway because --force was given.`,
    "",
    ...blockers.flatMap(renderCheck),
  ].join("\n");
}

/**
 * Checks the requested packages, then runs the package manager only when the gate allows it.
 * The lookup and the runner are injectable so hosts and tests can reuse the policy without a subprocess.
 */
export async function runGuard(request: GuardRequest, options: GuardOptions = {}): Promise<GuardResult> {
  const checks = await checkGuardPackages(request.packages, options);
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
  if (version !== undefined && (version === "" || version.includes("/") || version.startsWith("npm:"))) return undefined;
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
 * Parses the arguments after `npm`. Flags are forwarded to npm; local paths, URLs, and aliases are
 * forwarded unchecked. Registry package specs are judged before npm is called.
 */
export function parseNpmInstall(args: readonly string[]): GuardRequest {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined || !npmInstallCommands.has(subcommand)) {
    throw new GuardUsageError(`Expected \`npm install\`; got \`npm ${subcommand ?? ""}\`.`);
  }
  const requestArgs = ["install"];
  const packages: GuardPackage[] = [];
  for (const argument of rest) {
    const entry = argument.startsWith("-") ? undefined : parseNpmPackage(argument);
    if (entry === undefined) requestArgs.push(argument);
    else packages.push(entry);
  }
  return { command: "npm", args: requestArgs, packages, ...(process.platform === "win32" ? { shell: true } : {}) };
}

/** Parses `evergreen guard <manager> <command>...` into a request plus the gate and override. */
export function parseGuardArgs(args: readonly string[]): ParsedGuard {
  const managerArgs: string[] = [];
  let failOn: GuardGate = "high";
  let override = false;
  for (let index = 0; index < args.length; index += 1) {
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
    } else {
      managerArgs.push(argument);
    }
  }

  const [manager] = managerArgs;
  if (manager === undefined) throw new GuardUsageError("Missing package manager. Use `evergreen guard npm install <package>...`.");
  if (manager !== "npm") throw new GuardUsageError(`Unsupported package manager "${manager}". Today only npm is supported.`);
  return { request: parseNpmInstall(managerArgs.slice(1)), failOn, override };
}

/** The CLI entry point: parse, check, and run the package manager only when allowed. */
export async function guardCommand(args: readonly string[], options: GuardOptions = {}): Promise<GuardResult> {
  const parsed = parseGuardArgs(args);
  return runGuard(parsed.request, { ...options, failOn: parsed.failOn, override: parsed.override || options.override === true });
}
