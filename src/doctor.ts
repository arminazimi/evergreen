import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { satisfies } from "semver";

import { checkAgainst, systemToolRules } from "./check-dependency.js";
import type { RegistryV2Rule } from "./registry.js";

export const doctorCategories = ["runtime", "package", "mcp", "skill", "plugin", "ci", "system"] as const;
export type DoctorCategory = (typeof doctorCategories)[number];
export type DoctorStatus = "pass" | "warning" | "fail";
export type DoctorContext = "local" | "github-actions" | "gitlab-ci";

export interface DoctorCheck {
  id: string;
  category: DoctorCategory;
  status: DoctorStatus;
  summary: string;
  details: string;
  remediation?: string;
}

export interface DoctorResult {
  schemaVersion: "evergreen.doctor.v1";
  root: string;
  context: {
    kind: DoctorContext;
    platform: NodeJS.Platform;
    nodeVersion: string;
  };
  summary: {
    status: "ready" | "ready-with-warnings" | "not-ready";
    passed: number;
    warnings: number;
    failed: number;
  };
  checks: DoctorCheck[];
  /** The tools found on this machine; present only when `--system` was requested. */
  system?: SystemTool[];
  privacy: {
    repositoryDataUploaded: false;
    configurationMutated: false;
  };
}

export interface SystemTool {
  /** The executable that was asked for its version. */
  tool: string;
  version: string;
  /** The release line the version belongs to, such as `22` or `3.12`. */
  line: string;
  status: "supported" | "end-of-life" | "scheduled-end-of-life";
  ruleId?: string;
  deadline?: string;
  replacement?: string;
}

/** Runs `command` with fixed arguments and returns what it printed, or undefined when it is missing or fails. */
export type VersionRunner = (command: string, args: readonly string[]) => Promise<string | undefined>;

export interface DoctorOptions {
  /** Also report the runtimes and tools installed on this machine. */
  system?: boolean;
  versionRunner?: VersionRunner;
  systemRules?: readonly RegistryV2Rule[];
  environment?: Readonly<Record<string, string | undefined>>;
  installationRoot?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
}

interface PackageManifest {
  name?: string;
  engines?: { node?: string };
  bin?: Record<string, string>;
}

const defaultInstallationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function detectContext(environment: Readonly<Record<string, string | undefined>>): DoctorContext {
  if (environment.GITHUB_ACTIONS === "true") return "github-actions";
  if (environment.GITLAB_CI === "true") return "gitlab-ci";
  return "local";
}

function resultStatus(checks: DoctorCheck[]): DoctorResult["summary"] {
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  return {
    status: failed > 0 ? "not-ready" : warnings > 0 ? "ready-with-warnings" : "ready",
    passed,
    warnings,
    failed,
  };
}

async function readManifest(root: string): Promise<PackageManifest | undefined> {
  try {
    return JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

async function runtimeCheck(nodeVersion: string, manifest?: PackageManifest): Promise<DoctorCheck> {
  const required = manifest?.engines?.node ?? ">=22";
  if (satisfies(nodeVersion, required, { includePrerelease: true })) {
    return {
      id: "runtime.node",
      category: "runtime",
      status: "pass",
      summary: `Node.js ${nodeVersion} satisfies ${required}.`,
      details: "The current runtime can execute this Evergreen installation.",
    };
  }
  return {
    id: "runtime.node",
    category: "runtime",
    status: "fail",
    summary: `Node.js ${nodeVersion} does not satisfy ${required}.`,
    details: "Evergreen cannot reliably run on this Node.js version.",
    remediation: `Install a Node.js release matching ${required}, then run evergreen doctor again.`,
  };
}

function packageCheck(manifest?: PackageManifest): DoctorCheck {
  if (manifest?.name === "evergreen-deprecation" && manifest.bin?.evergreen) {
    return {
      id: "package.installation",
      category: "package",
      status: "pass",
      summary: "The Evergreen package and CLI entry point are present.",
      details: `CLI entry: ${manifest.bin.evergreen}`,
    };
  }
  return {
    id: "package.installation",
    category: "package",
    status: "fail",
    summary: "The Evergreen package metadata or CLI entry point is incomplete.",
    details: "Expected package evergreen-deprecation with an evergreen executable.",
    remediation: "Reinstall evergreen-deprecation from npm or rebuild the source checkout.",
  };
}

async function mcpCheck(installationRoot: string, manifest?: PackageManifest): Promise<DoctorCheck> {
  const entry = manifest?.bin?.["evergreen-mcp"];
  if (entry && await exists(resolve(installationRoot, entry))) {
    return {
      id: "mcp.stdio-server",
      category: "mcp",
      status: "pass",
      summary: "The local MCP stdio server is available.",
      details: `MCP entry: ${entry}; no network listener or credentials are required.`,
    };
  }
  return {
    id: "mcp.stdio-server",
    category: "mcp",
    status: "fail",
    summary: "The local MCP stdio server entry point is unavailable.",
    details: entry ? `Missing built entry: ${entry}` : "The evergreen-mcp package entry is not declared.",
    remediation: "Reinstall the package or run npm run build in an Evergreen source checkout.",
  };
}

async function skillCheck(installationRoot: string): Promise<DoctorCheck> {
  const path = resolve(installationRoot, "skills/evergreen-deprecation/SKILL.md");
  try {
    const source = await readFile(path, "utf8");
    if (
      source.startsWith("---\n")
      && /^name:\s*evergreen-deprecation\s*$/m.test(source)
      && /^description:\s*\S.+$/m.test(source)
      && /\n---\n/.test(source)
    ) {
      return {
        id: "skill.portable-bundle",
        category: "skill",
        status: "pass",
        summary: "The portable Evergreen Agent Skill is available.",
        details: "The skill has valid frontmatter and can be copied or linked into a compatible host.",
      };
    }
  } catch {
    // The failure below includes the remediation and remains deterministic.
  }
  return {
    id: "skill.portable-bundle",
    category: "skill",
    status: "fail",
    summary: "The portable Evergreen Agent Skill is missing or invalid.",
    details: "Expected skills/evergreen-deprecation/SKILL.md with Evergreen frontmatter.",
    remediation: "Reinstall the package or restore the packaged skills/evergreen-deprecation directory.",
  };
}

function pluginCheck(checks: DoctorCheck[]): DoctorCheck {
  const foundationsReady = checks
    .filter((check) => check.category === "mcp" || check.category === "skill")
    .every((check) => check.status === "pass");
  if (!foundationsReady) {
    return {
      id: "plugin.foundation",
      category: "plugin",
      status: "fail",
      summary: "Plugin prerequisites are incomplete.",
      details: "Evergreen plugins require both the local MCP server and portable Agent Skill.",
      remediation: "Repair the failed MCP and Skill checks before configuring a host plugin.",
    };
  }
  return {
    id: "plugin.foundation",
    category: "plugin",
    status: "warning",
    summary: "Shared plugin prerequisites are ready; host-specific plugins remain experimental.",
    details: "The MCP server and portable skill are available, but no stable host plugin is bundled yet.",
    remediation: "Use the CLI, MCP server, or portable skill until a host-specific plugin is published.",
  };
}

async function ciCheck(
  context: DoctorContext,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<DoctorCheck> {
  if (context === "local") {
    return {
      id: "ci.environment",
      category: "ci",
      status: "pass",
      summary: "Local execution detected; no CI workspace variables are required.",
      details: "Use evergreen doctor inside CI to validate runner-specific variables.",
    };
  }
  const variable = context === "github-actions" ? "GITHUB_WORKSPACE" : "CI_PROJECT_DIR";
  const workspace = environment[variable];
  if (workspace) {
    try {
      if ((await stat(workspace)).isDirectory()) {
        return {
          id: "ci.environment",
          category: "ci",
          status: "pass",
          summary: `${context === "github-actions" ? "GitHub Actions" : "GitLab CI"} workspace is available.`,
          details: `${variable} points to an accessible directory.`,
        };
      }
    } catch {
      // The failure below includes the missing or inaccessible workspace.
    }
  }
  return {
    id: "ci.environment",
    category: "ci",
    status: "fail",
    summary: `${context === "github-actions" ? "GitHub Actions" : "GitLab CI"} workspace is unavailable.`,
    details: `${variable} is missing or does not point to an accessible directory.`,
    remediation: `Run Evergreen after checkout and ensure ${variable} points to the checked-out repository.`,
  };
}

interface SystemToolSpec {
  tool: string;
  /** The name rules are written against: `pkg:generic/<purl>`. */
  purl: string;
  args: readonly string[];
  /** Pulls the version out of the output; undefined when the output is not recognisable. */
  parse: (output: string) => string | undefined;
  /** Reduces a version to its release line. */
  line: (version: string) => string;
}

const lifecycleEvents: ReadonlySet<string> = new Set(["end-of-life", "end-of-support", "scheduled-end-of-life"]);

function numeric(match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;
  const parts = [match[1], match[2] ?? "0", match[3] ?? "0"];
  return parts.join(".");
}

const major = (version: string): string => version.split(".")[0]!;
const majorMinor = (version: string): string => version.split(".").slice(0, 2).join(".");

const systemToolSpecs: readonly SystemToolSpec[] = [
  { tool: "node", purl: "pkg:generic/nodejs", args: ["--version"], parse: (o) => numeric(o.match(/v?(\d+)\.(\d+)\.(\d+)/)), line: major },
  { tool: "python3", purl: "pkg:generic/python", args: ["--version"], parse: (o) => numeric(o.match(/Python (\d+)\.(\d+)(?:\.(\d+))?/)), line: majorMinor },
  { tool: "go", purl: "pkg:generic/golang", args: ["version"], parse: (o) => numeric(o.match(/go version go(\d+)\.(\d+)(?:\.(\d+))?/)), line: majorMinor },
  {
    tool: "java",
    purl: "pkg:generic/java",
    // `java --version` only exists from Java 9; `-version` works on every release and prints to stderr.
    args: ["-version"],
    parse: (o) => {
      const match = o.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
      if (!match) return undefined;
      // Java 8 and older call themselves 1.8.0_x.
      return match[1] === "1" && match[2] ? `${match[2]}.0.0` : numeric(match);
    },
    line: major,
  },
  { tool: "dotnet", purl: "pkg:generic/dotnet", args: ["--version"], parse: (o) => numeric(o.match(/^(\d+)\.(\d+)\.(\d+)/m)), line: majorMinor },
  { tool: "terraform", purl: "pkg:generic/terraform", args: ["--version"], parse: (o) => numeric(o.match(/Terraform v(\d+)\.(\d+)\.(\d+)/)), line: majorMinor },
];

const runVersionCommand: VersionRunner = (command, args) =>
  new Promise((resolveOutput) => {
    execFile(command, [...args], { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      resolveOutput(error ? undefined : `${stdout}${stderr}`);
    });
  });

/** Asks each known tool for its version and matches it against the bundled lifecycle rules. Missing tools are skipped. */
export async function diagnoseSystem(options: DoctorOptions = {}): Promise<SystemTool[]> {
  const run = options.versionRunner ?? runVersionCommand;
  const found = await Promise.all(systemToolSpecs.map(async (spec) => {
    const output = await run(spec.tool, spec.args);
    const version = output === undefined ? undefined : spec.parse(output);
    return version === undefined ? undefined : { spec, version };
  }));
  const present = found.filter((entry) => entry !== undefined);
  if (present.length === 0) return [];

  const rules = (options.systemRules ?? await systemToolRules()).filter((rule) => lifecycleEvents.has(rule.event));
  return present.map(({ spec, version }) => {
    const finding = checkAgainst(rules, { purl: spec.purl, version }).findings[0];
    const base = { tool: spec.tool, version, line: spec.line(version) };
    if (!finding) return { ...base, status: "supported" as const };
    return {
      ...base,
      status: finding.event === "scheduled-end-of-life" ? "scheduled-end-of-life" as const : "end-of-life" as const,
      ruleId: finding.ruleId,
      ...(finding.deadline ? { deadline: finding.deadline } : {}),
      ...(finding.replacement ? { replacement: finding.replacement } : {}),
    };
  });
}

function systemCheck(entry: SystemTool): DoctorCheck {
  const label = `${entry.tool} ${entry.version} (line ${entry.line})`;
  if (entry.status === "supported") {
    return {
      id: `system.${entry.tool}`,
      category: "system",
      status: "pass",
      summary: `${label} is supported.`,
      details: "No end-of-life or end-of-support rule covers this release line.",
    };
  }
  const when = entry.deadline ? ` ${entry.status === "scheduled-end-of-life" ? "on" : "since"} ${entry.deadline}` : "";
  return {
    id: `system.${entry.tool}`,
    category: "system",
    status: "warning",
    summary: `${label} ${entry.status === "scheduled-end-of-life" ? "reaches end of support" : "is out of support"}${when}.`,
    details: `Matched rule ${entry.ruleId}.`,
    ...(entry.replacement ? { remediation: `Replacement: ${entry.replacement}.` } : {}),
  };
}

export async function diagnoseEnvironment(root = ".", options: DoctorOptions = {}): Promise<DoctorResult> {
  const environment = options.environment ?? process.env;
  const installationRoot = resolve(options.installationRoot ?? defaultInstallationRoot);
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const platform = options.platform ?? process.platform;
  const context = detectContext(environment);
  const manifest = await readManifest(installationRoot);
  const checks: DoctorCheck[] = [
    await runtimeCheck(nodeVersion, manifest),
    packageCheck(manifest),
    await mcpCheck(installationRoot, manifest),
    await skillCheck(installationRoot),
  ];
  checks.push(pluginCheck(checks));
  checks.push(await ciCheck(context, environment));
  const system = options.system ? await diagnoseSystem(options) : undefined;
  if (system) checks.push(...system.map(systemCheck));

  return {
    schemaVersion: "evergreen.doctor.v1",
    root: resolve(root),
    context: { kind: context, platform, nodeVersion },
    summary: resultStatus(checks),
    checks,
    ...(system ? { system } : {}),
    privacy: {
      repositoryDataUploaded: false,
      configurationMutated: false,
    },
  };
}

export function renderDoctorText(result: DoctorResult): string {
  const symbols: Record<DoctorStatus, string> = { pass: "PASS", warning: "WARN", fail: "FAIL" };
  const lines = [
    "Evergreen doctor",
    `Repository: ${result.root}`,
    `Environment: ${result.context.kind} on ${result.context.platform}`,
    `Status: ${result.summary.status}`,
  ];
  for (const check of result.checks) {
    lines.push("", `[${symbols[check.status]}] ${check.category}: ${check.summary}`, check.details);
    if (check.remediation) lines.push(`Next: ${check.remediation}`);
  }
  lines.push(
    "",
    "Privacy: no repository data was uploaded and no configuration was changed.",
  );
  return lines.join("\n");
}
