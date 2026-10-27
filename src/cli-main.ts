
import { spawnSync } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import http from "node:http";
import process from "node:process";
import { resolve } from "node:path";

import { applyAsOf } from "./as-of.js";
import { applyMinSupport, parseMinSupportDays } from "./min-support.js";
import { DEFAULT_WARN_DAYS, createBaseline, debtTrendLine, evaluateBaseline, expiredPolicies, expiredSuppressionsFail, readBaseline, readBaselines, writeBaseline } from "./baseline.js";
import type { ExpiredPolicy } from "./baseline.js";
import { isIsoDate } from "./registry.js";
import { getCapabilityManifest, renderCapabilitiesText } from "./capabilities.js";
import { isCompletionShell, renderCompletions, renderExamples } from "./completions.js";
import { bundledRules, checkDependency, CheckDependencyError } from "./check-dependency.js";
import { AgentFileError } from "./agent-instructions.js";
import { configureActiveData, DataPinError, getActiveData } from "./data-source.js";
import { DataUpdateError, renderDataUpdateText, updateData } from "./data-update.js";
import { getDataStatus, renderDataStatusText } from "./data-status.js";
import { guardCommand, GuardUsageError } from "./guard.js";
import { initAgents } from "./init-agents.js";
import { initHooks } from "./init-hooks.js";
import { hasPersonalConfig, initPersonal } from "./init-personal.js";
import { planInitSetup, applyInitSetup, hasWritables, planSummary } from "./init.js";
import type { InitStep } from "./init.js";
import { renderUsageText, summarizeUsage, usageLogPath } from "./usage-log.js";
import { applySetup, planSetup } from "./setup.js";
import type { AgentFileName } from "./init-agents.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import { buildForecast, DEFAULT_FORECAST_MONTHS, MAX_FORECAST_MONTHS, renderForecastText } from "./forecast.js";
import { applyOnBranch } from "./fix/git.js";
import { planFixes, renderPatches } from "./fix/index.js";
import { renderVerification, verifyFix } from "./fix/verify.js";
import { findRepositories, renderMultiScanText, scanProjects, scanRepository } from "./engine.js";
import { createMigrationPacket } from "./migration-packet.js";
import { readPinnedRuntimes } from "./runtime-pin.js";
import { DiffError, diffRefs, renderDiffText } from "./diff.js";
import { groupScanByOwner, renderOwnerGroupsText } from "./codeowners.js";
import { RollupError, renderRollupText, rollupFiles } from "./rollup.js";
import { buildRenovatePreset } from "./renovate-preset.js";
import { diagnoseEnvironment, renderDoctorText } from "./doctor.js";
import { createIssueReport, ReportIssueError } from "./report-issue.js";
import { renderCheckText, renderCodeQuality, renderCompact, renderFindingText, renderHtml, renderJson, renderJunit, renderMarkdown, renderMigrationPacketText, renderRdjson, renderSarif, renderSlack, renderTeams, renderText, renderWebhook } from "./reporters.js";
import { STATUS_FILE_NAME, writeStatusFile } from "./status-file.js";
import { browseFindings, canBrowse } from "./tui.js";
import { VERSION } from "./version.js";
import { exportActiveCle } from "./export/cle.js";
import {
  invalidConfig,
  isOfflineDataUpdateFailure,
  offlineDataUpdate,
  renderActionable,
  unexpectedFailure,
  unreadablePath,
  type ActionableMessage,
} from "./errors.js";
import { CycloneDxError, enrichCycloneDxFile } from "./sbom/cyclonedx.js";
import { addWatched, listWatched, removeWatched, renderWatchText, runWatch } from "./watch.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json | --format <text|json|markdown|junit|sarif|rdjson|codequality|compact|html|slack|teams|webhook>]
  evergreen scan [path] --baseline <file> [--baseline <file>...] [--baseline-warn-days <n>] [--on-expired resurface|fail] [--today <YYYY-MM-DD>] [--json]
  evergreen scan [path] --as-of <YYYY-MM-DD> [--json]   # scan as the world will look on a date; --today is an alias
  evergreen scan [path] --min-support-days <n>   # warn on lines whose support ends within n days
  evergreen scan [path] --write-status
  evergreen scan [path] --interactive   # browse findings and open them in $EDITOR; plain text when not a terminal
  evergreen scan [path] --fail-on <severity|none>   # exit 1 when a finding is at or above the severity
  evergreen scan <path> <path>... [--all <dir>] [--json]   # several projects, per-project and combined counts
  evergreen forecast [path] [--months <n>] [--as-of <YYYY-MM-DD>] [--json]   # what reaches end of life next, by month
  evergreen diff <base>..<head> [path] [--json]   # findings a change introduced or fixed; exit 1 only when it introduced some
  evergreen scan [path] --by-owner [--json]   # group findings by CODEOWNERS owner; files with no owner are listed as unowned
  evergreen rollup <report.json>... [--owners <file>] [--json]   # merge saved scan reports by product and owner; reads files only
  evergreen renovate-preset [path]   # print Renovate packageRules for replacements and runtime pins; does not edit config
  evergreen fix [path] [--dry-run]   # print patches for deterministic fixes; nothing is written
  evergreen fix [path] --branch      # apply the fixes on a local evergreen/fix branch and commit; never pushes
  evergreen baseline [path] [--output <file>]
  evergreen check <purl> [--fail-on <severity|none>] [--json]
  evergreen guard [--fail-on <severity|none>] [--force] npm install <package>...   # check first; flags after npm go to npm
  evergreen usage [--file <path>] [--json]
  evergreen mcp
  evergreen data status [--json]
  evergreen export --format cle [--data-version <version>]   # CLE 1.0 snapshots, one JSON document per line and component; skipped rules reported on stderr
  evergreen sbom enrich <bom.json> [--data-version <version>]   # print enriched CycloneDX JSON; leaves the input unchanged
  evergreen watch add|remove <path>   # register a project for the digest
  evergreen watch [run] [--weekly] [--json]   # re-scan registered projects, print only what changed
  evergreen watch list [--json]
  evergreen init [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]   # ask what to set up; apply the defaults for CI, the pre-push hook, and agents
  evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]
  evergreen init --hooks [path] [--fail-on <severity>] [--dry-run]   # git pre-push hook; combine with --agents
  evergreen init --personal [--fail-on <severity>] [--yes] [--dry-run]   # global config and pre-push hook for every repository
  evergreen setup [path] [--yes] [--dry-run]
  evergreen new-detector <id> [--ecosystem <slug>]
  evergreen data update [--data-version <version>] [--json]
  evergreen explain <finding-id> [path] [--json]
  evergreen context <finding-id> [path] [--json]
  evergreen doctor [path] [--system] [--json]
  evergreen report-issue <finding-id> [path] [--output <file>]
  evergreen capabilities [--json]
  evergreen completions <bash|zsh|fish>   # print a shell completion script
  evergreen --debug …   # on unexpected failures, print the stack trace
  evergreen --help
  evergreen --version

${renderExamples()}`;

/**
 * The stable failure classes. `policy` (1) and `usage` (2) keep the exit codes Evergreen has always used; the rest are
 * distinct so a caller can branch on the exit code alone. Documented in docs/CAPABILITIES.md.
 */
const EXIT_CODES = { policy: 1, usage: 2, data: 3, parse: 4, internal: 5 } as const;
type FailureClass = keyof typeof EXIT_CODES;

let jsonErrors = false;
let debugErrors = false;

/**
 * Reports a failure and returns its exit code. The message always goes to stderr; with `--json` it is also written to
 * stdout as an `evergreen.error.v1` document. A `policy` failure is a verdict on a result that was already printed, so
 * it writes no second document.
 */
function fail(kind: FailureClass, message: string, appendix = ""): number {
  process.stderr.write(`${message}\n${appendix}`);
  if (jsonErrors && kind !== "policy") {
    const document = { schemaVersion: "evergreen.error.v1", error: { code: kind, exitCode: EXIT_CODES[kind], message } };
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  }
  return EXIT_CODES[kind];
}

/** Reports an actionable failure: one-line cause (and JSON message) plus a stderr-only next step. */
function failActionable(kind: FailureClass, actionable: ActionableMessage): number {
  const { message, appendix } = renderActionable(actionable);
  return fail(kind, message, appendix);
}

/**
 * `data update` is the one command that uses the network, and it must honor the standard proxy variables. Node does
 * that for `fetch` only when started with NODE_USE_ENV_PROXY, so when a proxy is configured the command runs again
 * in a child process that has it (Node 22.21 and later). Returns that child's exit code, or undefined to carry on.
 */
function relaunchWithEnvironmentProxy(): number | undefined {
  const proxied = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"].some((name) => process.env[name]);
  if (!proxied || process.env.NODE_USE_ENV_PROXY) return undefined;
  if (typeof http.setGlobalProxyFromEnv === "function") return undefined;
  if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
    process.stderr.write("A proxy is configured, but this Node.js cannot use it for downloads. Use Node.js 22.21 or newer.\n");
    return undefined;
  }
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  return child.status ?? 1;
}

/** Returns why `path` cannot be scanned as a repository root, or undefined when it is an existing directory. */
async function repositoryRootProblem(path: string): Promise<ActionableMessage | undefined> {
  try {
    return (await stat(path)).isDirectory() ? undefined : unreadablePath(path, "not-directory");
  } catch (error) {
    return unreadablePath(path, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable");
  }
}

async function confirmOnTerminal(summary: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) throw new AgentFileError("Confirmation needs a terminal; pass --yes to confirm, or --dry-run to preview.");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${summary}\nContinue? [${defaultYes ? "Y" : "y"}/N${defaultYes ? "]" : "] "}`)).trim();
    return defaultYes ? !/^n(o)?$/i.test(answer) : /^y(es)?$/i.test(answer);
  } finally {
    rl.close();
  }
}

/** `init` with no flags asks what to set up (guided); `init --agents`, `--hooks`, and `--personal` do one thing without asking. */
async function init(args: string[]): Promise<number> {
  const usage = "Usage: evergreen init [--agents] [--hooks] [--personal] [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]\n";
  const agents = args.includes("--agents");
  const hooks = args.includes("--hooks");
  const personal = args.includes("--personal");
  const guided = !agents && !hooks && !personal;
  if (personal && (agents || hooks)) return fail("usage", "--personal cannot be combined with --agents or --hooks.", usage);
  const fileIndex = args.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
  if (fileIndex !== -1 && (!agents && !guided || fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md")) {
    return fail("usage", "--file must be AGENTS.md or CLAUDE.md, and needs --agents or the guided init.", usage);
  }
  const gateIndex = args.indexOf("--fail-on");
  const gate = gateIndex === -1 ? "high" : args[gateIndex + 1];
  if (gateIndex !== -1 && ((!(hooks || personal) && !guided) || !severityValues.includes(gate as Severity))) {
    return fail("usage", `--fail-on needs the guided init, --hooks or --personal, and a severity (${severityValues.join(", ")}).`, usage);
  }
  const flags = new Set(["--agents", "--hooks", "--personal", "--yes", "-y", "--dry-run", "--file", "--fail-on"]);
  const positional = args.filter((argument, index) => !flags.has(argument) && index !== fileIndex + 1 && index !== gateIndex + 1 && !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument.startsWith("-") && !flags.has(argument));
  if (unknown.length > 0 || positional.length > 1 || (personal && positional.length > 0)) {
    return fail("usage", usage.trimEnd());
  }
  const dryRun = args.includes("--dry-run");
  const root = positional[0] ?? ".";
  try {
    if (guided) return await guidedInit({ root, gate: gate as Severity, dryRun, ...(fileValue !== undefined ? { file: fileValue as AgentFileName } : {}), yes: args.includes("--yes") || args.includes("-y") });
    if (personal) {
      const yes = args.includes("--yes") || args.includes("-y");
      const result = await initPersonal({ gate: gate as Severity, dryRun, confirm: yes ? async () => true : confirmOnTerminal });
      if (result.change === "unchanged") process.stdout.write("The global Evergreen config and pre-push hook are already current; nothing to change.\n");
      else if (result.change === "declined") process.stdout.write("Nothing was changed.\n");
      else if (dryRun) process.stdout.write(`Would write the global config and pre-push hook in ${result.hooksDirectory}:\n\n${result.diff}\n`);
      else process.stdout.write(`Wrote ${result.configFile} and the pre-push hook in ${result.hooksDirectory}; every repository now blocks a push at ${gate} or above.\nBypass it once with \`git push --no-verify\` or \`EVERGREEN_SKIP=1 git push\`.\n`);
      return 0;
    }
    if (agents) {
      const result = await initAgents({ root, dryRun, ...(fileValue ? { file: fileValue as AgentFileName } : {}) });
      if (result.change === "unchanged") process.stdout.write(`${result.file} already has the current Evergreen section; nothing to change.\n`);
      else {
        const verb = result.change === "created" ? "create" : result.change === "added" ? "add the Evergreen section to" : "update the Evergreen section in";
        process.stdout.write(dryRun ? `Would ${verb} ${result.file}:\n\n${result.diff}\n` : `${result.change === "created" ? "Created" : result.change === "added" ? "Added the Evergreen section to" : "Updated the Evergreen section in"} ${result.file}.\n`);
      }
    }
    if (hooks) {
      const result = await initHooks({ root, gate: gate as Severity, dryRun });
      if (result.change === "managed") {
        process.stdout.write(`${result.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${result.file}:\n\n${result.snippet}\n`);
      } else if (result.change === "unchanged") process.stdout.write(`${result.file} already has the current Evergreen hook; nothing to change.\n`);
      else {
        const verb = result.change === "created" ? "create" : "update";
        process.stdout.write(dryRun ? `Would ${verb} ${result.file}:\n\n${result.diff}\n` : `${result.change === "created" ? "Created" : "Updated"} ${result.file}; it blocks a push at ${gate} or above.\n`);
      }
      if (result.change !== "managed") process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
    }
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return fail("parse", error.message);
    throw error;
  }
}

/**
 * `init` with no flags: detects the CI provider and agent hosts, and applies what it finds (the GitHub Actions
 * workflow, the pre-push hook, the Evergreen agent section) after one confirmation that defaults to yes.
 */
async function guidedInit(options: { root: string; gate: Severity; dryRun?: boolean; file?: AgentFileName; yes?: boolean }): Promise<number> {
  if (!options.yes && !options.dryRun && !process.stdin.isTTY) {
    return fail("usage", "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.");
  }
  const plan = await planInitSetup({ root: options.root, gate: options.gate, ...(options.file ? { file: options.file } : {}) });
  process.stdout.write(`Detected: ${plan.detectedCi.length > 0 ? plan.detectedCi.join(" and ") : "no CI"}; ${plan.detectedAgents.length > 0 ? plan.detectedAgents.join(", ") : "no agent hosts"}\n`);
  if (options.dryRun) {
    printGuidedSteps(plan.steps, options.dryRun === true, options.gate);
    process.stdout.write("Dry run: nothing was written.\n");
    return 0;
  }
  if (!hasWritables(plan)) {
    printGuidedSteps(plan.steps, false, options.gate);
    return 0;
  }
  if (!options.yes && !(await confirmOnTerminal(planSummary(plan), true))) {
    process.stdout.write("Nothing was changed.\n");
    return 0;
  }
  const result = await applyInitSetup({ plan, gate: options.gate });
  printGuidedSteps(result.steps, false, options.gate);
  return 0;
}

function printGuidedSteps(steps: InitStep[], dryRun: boolean, gate: Severity): void {
  for (const step of steps) {
    if (step.change === "advice") {
      process.stdout.write(`Add this to ${step.file} to scan with the Evergreen GitLab component:\n\n${step.snippet}\n`);
      continue;
    }
    if (step.change === "managed") {
      process.stdout.write(`${step.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${step.file}:\n\n${step.snippet}\n`);
      continue;
    }
    const future = { created: "Would create", added: "Would add the Evergreen section to", updated: "Would update" };
    const past = { created: "Created", added: "Added the Evergreen section to", updated: "Updated" };
    if (step.change === "unchanged") {
      const noun = step.kind === "agents" ? "section" : step.kind === "ci" ? "workflow" : "hook";
      process.stdout.write(`${step.file} already has the current Evergreen ${noun}; nothing to change.\n`);
      continue;
    }
    const verb = dryRun ? future[step.change as keyof typeof future] : past[step.change as keyof typeof past];
    const tail = step.kind === "ci" ? "; it scans pull requests and pushes to main." : step.kind === "hooks" ? `; it blocks a push at ${gate} or above.` : ".";
    process.stdout.write(`${verb} ${step.file}${tail}\n`);
    if (dryRun && step.diff) process.stdout.write(`\n${step.diff}\n`);
    if (step.kind === "hooks") process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
  }
}

/** `setup`: adds the Evergreen section to the instruction file of every detected agent host. */
async function setup(args: string[]): Promise<number> {
  const usage = "Usage: evergreen setup [path] [--yes] [--dry-run]";
  const flags = new Set(["--yes", "-y", "--dry-run"]);
  const positional = args.filter((argument) => !argument.startsWith("-"));
  if (args.some((argument) => argument.startsWith("-") && !flags.has(argument)) || positional.length > 1) return fail("usage", usage);
  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");
  const root = positional[0] ?? ".";
  try {
    const plan = await planSetup(root);
    if (plan.entries.length === 0) {
      process.stdout.write("No agent host configuration found (looked for Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, and Kilo Code).\nRun `evergreen init --agents` to add the section to AGENTS.md or CLAUDE.md.\n");
      return 0;
    }
    process.stdout.write(`Detected: ${plan.detected.join(", ")}\n\n`);
    for (const entry of plan.entries) {
      const verb = { created: "create", added: "add the Evergreen section to", updated: "update the Evergreen section in", unchanged: "leave unchanged" }[entry.change];
      process.stdout.write(`${verb === "leave unchanged" ? "Already current:" : `Would ${verb}`} ${entry.file} (${entry.hosts.join(", ")})\n`);
      if (entry.diff) process.stdout.write(`\n${entry.diff}\n\n`);
    }
    if (plan.entries.every((entry) => entry.change === "unchanged")) {
      process.stdout.write("Nothing to change.\n");
      return 0;
    }
    if (dryRun) {
      process.stdout.write("Dry run: nothing was written.\n");
      return 0;
    }
    if (!yes) {
      if (!process.stdin.isTTY) return fail("usage", "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.");
      const readline = await import("node:readline/promises");
      const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await prompt.question("Apply these changes? [y/N] ");
      prompt.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        process.stdout.write("Nothing was written.\n");
        return 0;
      }
    }
    const written = await applySetup(root, plan);
    process.stdout.write(`Updated ${written.join(", ")}.\n`);
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return fail("parse", error.message);
    throw error;
  }
}

/** `usage`: summarizes the local check log, which exists only when `EVERGREEN_USAGE_LOG` turned it on. */
async function usage(args: string[]): Promise<number> {
  const usageText = "Usage: evergreen usage [--file <path>] [--json]";
  const fileIndex = args.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
  const rest = fileIndex === -1 ? args : args.filter((argument, index) => index !== fileIndex && index !== fileIndex + 1);
  if ((fileIndex !== -1 && (!fileValue || fileValue.startsWith("-"))) || rest.some((argument) => argument !== "--json")) return fail("usage", usageText);
  const file = fileValue ?? usageLogPath();
  if (!file) {
    process.stdout.write("Usage logging is off. Set EVERGREEN_USAGE_LOG=1 (or a file path) to record dependency checks locally, then run `evergreen usage`. Nothing leaves this machine.\n");
    return 0;
  }
  const summary = await summarizeUsage(file);
  process.stdout.write(`${args.includes("--json") ? JSON.stringify(summary, null, 2) : renderUsageText(summary)}\n`);
  return 0;
}

/** Creates a detector skeleton. The generator lives in the repository's tools, so this works in a checkout only. */
async function newDetector(args: string[]): Promise<number> {
  const ecosystemIndex = args.indexOf("--ecosystem");
  const ecosystem = ecosystemIndex === -1 ? undefined : args[ecosystemIndex + 1];
  const ecosystemValueIndex = ecosystemIndex === -1 ? -1 : ecosystemIndex + 1;
  const id = args.find((argument, index) => !argument.startsWith("-") && index !== ecosystemValueIndex);
  if (!id || (ecosystemIndex !== -1 && (!ecosystem || ecosystem.startsWith("-")))) {
    return fail("usage", "Usage: evergreen new-detector <id> [--ecosystem <slug>]");
  }
  let scaffold: typeof import("../tools/scaffold/index.js");
  try {
    scaffold = await import("../tools/scaffold/index.js");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      return fail("usage", "new-detector is for contributors: run it from a checkout of the Evergreen repository after npm run build.");
    }
    throw error;
  }
  try {
    process.stdout.write(`${scaffold.renderScaffoldResult(await scaffold.scaffoldDetector(id, ecosystem ? { ecosystem } : {}))}\n`);
    return 0;
  } catch (error) {
    if (error instanceof scaffold.ScaffoldError) return fail("usage", error.message);
    throw error;
  }
}

/** `watch`: keeps a list of projects and prints only the findings that are new since the last digest. */
async function watch(args: string[], json: boolean): Promise<number> {
  const usageText = "Usage: evergreen watch add|remove <path> | list [--json] | [run] [--weekly] [--json]";
  const rest = args.filter((argument, index) => argument !== "--json" && argument !== "--format" && args[index - 1] !== "--format");
  const [subcommand = "run", ...operands] = rest;
  try {
    if (subcommand === "add" || subcommand === "remove") {
      const [path] = operands;
      if (!path || operands.length > 1 || path.startsWith("-")) return fail("usage", usageText);
      const changed = subcommand === "add" ? await addWatched(path) : await removeWatched(path);
      const done = subcommand === "add" ? "Now watching" : "Stopped watching";
      const already = subcommand === "add" ? "Already watching" : "Was not watching";
      const project = resolve(path);
      process.stdout.write(`${changed ? done : already} ${project}\n`);
      return 0;
    }
    if (subcommand === "list") {
      if (operands.length > 0) return fail("usage", usageText);
      const projects = await listWatched();
      process.stdout.write(json ? `${JSON.stringify({ projects }, null, 2)}\n` : `${projects.length === 0 ? "No projects are watched. Add one with `evergreen watch add <path>`." : projects.join("\n")}\n`);
      return 0;
    }
    const weekly = operands.includes("--weekly");
    if (subcommand !== "run" || operands.some((argument) => argument !== "--weekly")) return fail("usage", usageText);
    const digest = await runWatch(builtInDetectors, { weekly });
    process.stdout.write(`${json ? JSON.stringify(digest, null, 2) : renderWatchText(digest)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof Error && !(error instanceof TypeError)) return fail("parse", error.message);
    throw error;
  }
}

async function main(rawArgs: string[]): Promise<number> {
  debugErrors = rawArgs.includes("--debug");
  const args = rawArgs.filter((argument) => argument !== "--debug");
  const formatValue = args[args.indexOf("--format") + 1];
  jsonErrors = args.includes("--json") || (args.includes("--format") && formatValue === "json");
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command] = args;
  if (command !== "sbom" && command !== "export" && command !== "scan" && command !== "check" && command !== "guard" && command !== "data" && command !== "new-detector" && command !== "init" && command !== "setup" && command !== "usage" && command !== "mcp" && command !== "explain" && command !== "context" && command !== "baseline" && command !== "forecast" && command !== "diff" && command !== "rollup" && command !== "renovate-preset" && command !== "fix" && command !== "doctor" && command !== "report-issue" && command !== "capabilities" && command !== "watch" && command !== "completions") {
    return fail("usage", `Unknown command: ${command ?? ""}`, `\n${HELP}`);
  }

  if (command === "mcp") {
    // The MCP server owns stdin and stdout until the host disconnects, so there is no exit code to return.
    (await import("./mcp-server.js")).startMcpServer();
    return await new Promise<number>(() => undefined);
  }
  if (command === "completions") {
    if (args.length !== 2 || !isCompletionShell(args[1])) return fail("usage", "Usage: evergreen completions <bash|zsh|fish>");
    process.stdout.write(renderCompletions(args[1]));
    return 0;
  }
  if (command === "new-detector") return newDetector(args.slice(1));
  if (command === "init") return init(args.slice(1));
  if (command === "setup") return setup(args.slice(1));
  if (command === "usage") return usage(args.slice(1));
  const dataVersionIndex = args.indexOf("--data-version");
  const dataVersionFlag = dataVersionIndex === -1 ? undefined : args[dataVersionIndex + 1];
  if (dataVersionIndex !== -1 && (!dataVersionFlag || dataVersionFlag.startsWith("-"))) {
    return fail("usage", "--data-version needs a version, for example 2026.10.01, or \"bundled\".");
  }
  const isUpdate = command === "data" && args[1] === "update";
  const dataPin = isUpdate ? undefined : (dataVersionFlag ?? (process.env.EVERGREEN_DATA_VERSION || undefined));
  if (command !== "capabilities" && !isUpdate) {
    configureActiveData(dataPin === undefined ? {} : { pinnedVersion: dataPin });
    try {
      await getActiveData();
    } catch (error) {
      if (error instanceof DataPinError) return fail(error.malformed ? "usage" : "data", error.message);
      throw error;
    }
  }
  const formatIndex = args.indexOf("--format");
  const format = formatIndex === -1 ? undefined : args[formatIndex + 1];
  if (command === "sbom") {
    const operands = args.slice(1).filter((_, index) => dataVersionIndex === -1 ||
      (index + 1 !== dataVersionIndex && index + 1 !== dataVersionIndex + 1));
    if (operands.length !== 2 || operands[0] !== "enrich" || operands[1]!.startsWith("-")) {
      return fail("usage", "Usage: evergreen sbom enrich <bom.json> [--data-version <version>]");
    }
    try {
      const bom = await enrichCycloneDxFile(operands[1]!);
      process.stdout.write(`${JSON.stringify(bom, null, 2)}\n`);
      return 0;
    } catch (error) {
      if (error instanceof CycloneDxError) return fail("parse", error.message);
      throw error;
    }
  }
  if (command === "export") {
    const operands = args.slice(1).filter((_, index) =>
      index + 1 !== formatIndex && index + 1 !== formatIndex + 1 &&
      (dataVersionIndex === -1 || (index + 1 !== dataVersionIndex && index + 1 !== dataVersionIndex + 1)));
    if (format !== "cle" || operands.length > 0) {
      return fail("usage", "Usage: evergreen export --format cle [--data-version <version>]");
    }
    const result = await exportActiveCle();
    for (const document of result.documents) process.stdout.write(`${JSON.stringify(document)}\n`);
    if (result.skipped > 0) process.stderr.write(`Skipped ${result.skipped} rules: CLE requires a dated component lifecycle event; deprecation, removal, symbol rules, and undated rules cannot be faithfully represented.\n`);
    return 0;
  }
  if (formatIndex !== -1 && format !== "text" && format !== "json" && format !== "markdown" && format !== "junit" && format !== "sarif" && format !== "rdjson" && format !== "codequality" && format !== "compact" && format !== "html" && format !== "slack" && format !== "teams" && format !== "webhook") {
    return fail("usage", `Unknown format: ${format ?? ""} (expected text, json, markdown, junit, sarif, rdjson, codequality, compact, html, slack, teams, or webhook).`);
  }
  if (command === "check" && format !== undefined && format !== "json" && format !== "text") {
    return fail("usage", "check supports --json and --format text|json only.");
  }
  if ((format === "markdown" || format === "junit" || format === "sarif" || format === "rdjson" || format === "codequality" || format === "compact" || format === "html" || format === "slack" || format === "teams" || format === "webhook") && command !== "scan") {
    return fail("usage", `--format ${format} is only available for the scan command.`);
  }
  const json = args.includes("--json") || format === "json";
  if (args.includes("--write-status") && command !== "scan") {
    return fail("usage", "--write-status is only available for the scan command.");
  }
  if (command === "guard") {
    try {
      const result = await guardCommand(args.slice(1), { report: (output) => process.stderr.write(`${output}\n`) });
      return result.exitCode;
    } catch (error) {
      if (error instanceof GuardUsageError) return fail("usage", error.message);
      throw error;
    }
  }
  if (command === "watch") return watch(args.slice(1), json);
  if (command === "capabilities") {
    const manifest = getCapabilityManifest();
    process.stdout.write(`${json ? JSON.stringify(manifest, null, 2) : renderCapabilitiesText(manifest)}\n`);
    return 0;
  }
  if (command === "data") {
    const subcommand = args[1];
    if (subcommand === "update") {
      const relaunched = relaunchWithEnvironmentProxy();
      if (relaunched !== undefined) return relaunched;
      try {
        const result = await updateData(dataVersionFlag ? { version: dataVersionFlag } : {});
        process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDataUpdateText(result)}\n`);
        return 0;
      } catch (error) {
        if (error instanceof DataUpdateError) {
          return isOfflineDataUpdateFailure(error.message)
            ? failActionable("data", offlineDataUpdate(error.message))
            : fail("data", error.message);
        }
        throw error;
      }
    }
    if (subcommand !== "status") {
      return fail("usage", `Unknown data command: ${subcommand ?? ""}`, `\n${HELP}`);
    }
    const status = await getDataStatus();
    process.stdout.write(`${json ? JSON.stringify(status, null, 2) : renderDataStatusText(status)}\n`);
    return 0;
  }
  const valueOptions = new Set(["--baseline", "--output", "--format", "--fail-on", "--data-version", "--today", "--as-of", "--min-support-days", "--baseline-warn-days", "--on-expired", "--all", "--months", "--owners"]);
  const positional: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (valueOptions.has(argument)) {
      index += 1;
    } else if (!argument.startsWith("-")) {
      positional.push(argument);
    }
  }
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const optionValues = (name: string): string[] => {
    const values: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === name && args[index + 1] !== undefined) {
        values.push(args[index + 1]!);
        index += 1;
      }
    }
    return values;
  };
  if (command === "check") {
    const purl = positional[0];
    if (!purl) {
      return fail("usage", "Missing package URL, for example pkg:npm/request@2.88.2.", `\n${HELP}`);
    }
    const gate = optionValue("--fail-on") ?? "high";
    if (gate !== "none" && !severityValues.includes(gate as Severity)) {
      return fail("usage", `Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).`);
    }
    try {
      const check = await checkDependency(purl);
      process.stdout.write(`${json ? JSON.stringify(check, null, 2) : renderCheckText(check)}\n`);
      const rank = (severity: Severity) => severityValues.indexOf(severity);
      return check.status === "affected" && gate !== "none" && rank(check.severity!) >= rank(gate as Severity) ? EXIT_CODES.policy : 0;
    } catch (error) {
      if (error instanceof CheckDependencyError) return fail("parse", error.message);
      throw error;
    }
  }
  const takesFindingId = command === "explain" || command === "context" || command === "report-issue";
  const findingId = takesFindingId ? positional[0] : undefined;
  if (takesFindingId && !findingId) {
    return fail("usage", "Missing finding ID.", `\n${HELP}`);
  }
  const pathArgument = takesFindingId
    ? (positional[1] ?? ".")
    : (positional[0] ?? ".");
  if (command === "doctor") {
    const result = await diagnoseEnvironment(pathArgument, { system: args.includes("--system") });
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDoctorText(result)}\n`);
    return result.summary.failed > 0 ? EXIT_CODES.policy : 0;
  }
  if (command === "rollup") {
    const ownersIndex = args.indexOf("--owners");
    const ownersFile = ownersIndex === -1 ? undefined : args[ownersIndex + 1];
    if (ownersIndex !== -1 && (!ownersFile || ownersFile.startsWith("-"))) return fail("usage", "--owners needs a file.");
    try {
      const result = await rollupFiles(positional.map((path) => resolve(path)), ownersFile && resolve(ownersFile));
      process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderRollupText(result)}\n`);
      return 0;
    } catch (error) {
      if (error instanceof RollupError) return fail("usage", error.message);
      throw error;
    }
  }
  if (command === "renovate-preset") {
    if (positional.length > 1) return fail("usage", "Usage: evergreen renovate-preset [path]");
    const result = await scanRepository(resolve(pathArgument), builtInDetectors);
    const preset = buildRenovatePreset(result.findings, await bundledRules());
    process.stdout.write(`${JSON.stringify(preset, null, 2)}\n`);
    return 0;
  }
  if (command === "diff") {
    const range = positional[0];
    if (!range) return fail("usage", "Missing range. Use evergreen diff <base>..<head>.", `\n${HELP}`);
    try {
      const result = await diffRefs(resolve(positional[1] ?? "."), range, builtInDetectors);
      process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDiffText(result)}\n`);
      return result.introduced.length > 0 ? EXIT_CODES.policy : 0;
    } catch (error) {
      if (error instanceof DiffError) return fail("usage", error.message);
      throw error;
    }
  }
  const allIndex = args.indexOf("--all");
  const allDirectory = allIndex === -1 ? undefined : args[allIndex + 1];
  if (allIndex !== -1 && (command !== "scan" || !allDirectory || allDirectory.startsWith("-"))) {
    return fail("usage", "--all needs a directory of repositories and is only available for the scan command.");
  }
  if (command === "scan" && (positional.length > 1 || allDirectory !== undefined)) {
    if (format !== undefined && format !== "text" && format !== "json") {
      return fail("usage", "Scanning several paths supports --json and --format text|json only.");
    }
    if (args.includes("--baseline") || args.includes("--write-status")) {
      return fail("usage", "--baseline and --write-status are not available when scanning several paths.");
    }
    let found: string[] = [];
    if (allDirectory !== undefined) {
      try {
        found = await findRepositories(allDirectory);
      } catch (error) {
        return fail("usage", `Cannot read ${allDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const paths = [...positional, ...found];
    if (paths.length === 0) {
      return fail("usage", `No Git repositories found in ${allDirectory}.`);
    }
    const multi = await scanProjects(paths, builtInDetectors);
    process.stdout.write(`${json ? JSON.stringify(multi, null, 2) : renderMultiScanText(multi)}\n`);
    return 0;
  }
  const rootProblem = await repositoryRootProblem(pathArgument);
  if (rootProblem) return failActionable("usage", rootProblem);
  const scanGate = optionValue("--fail-on") ?? "none";
  if (command === "scan" && scanGate !== "none" && !severityValues.includes(scanGate as Severity)) {
    return fail("usage", `Unknown severity for --fail-on: ${scanGate} (expected none, ${severityValues.join(", ")}).`);
  }
  const asOfValue = optionValue("--as-of") ?? optionValue("--today");
  if (asOfValue !== undefined && !isIsoDate(asOfValue)) {
    return fail("usage", "--as-of (or --today) must be a date (YYYY-MM-DD).");
  }
  if (command === "forecast") {
    const monthsValue = optionValue("--months");
    const months = monthsValue === undefined ? DEFAULT_FORECAST_MONTHS : Number(monthsValue);
    if (!Number.isInteger(months) || months < 1 || months > MAX_FORECAST_MONTHS) {
      return fail("usage", `--months must be a whole number from 1 to ${MAX_FORECAST_MONTHS}.`);
    }
    const forecast = buildForecast(await scanRepository(pathArgument, builtInDetectors), await bundledRules(), asOfValue ?? new Date().toISOString().slice(0, 10), months);
    process.stdout.write(`${json ? JSON.stringify(forecast, null, 2) : renderForecastText(forecast)}\n`);
    return 0;
  }
  if (command === "fix") {
    // Patches are printed unless --branch asks for a local, reviewable commit; nothing is ever pushed.
    const unknownFlag = args.slice(1).find((argument) => argument.startsWith("-") && argument !== "--dry-run" && argument !== "--branch" && argument !== "--data-version");
    if (unknownFlag !== undefined || positional.length > 1 || (args.includes("--dry-run") && args.includes("--branch"))) return fail("usage", "Usage: evergreen fix [path] [--dry-run | --branch]");
    const scanned = await scanRepository(pathArgument, builtInDetectors);
    const patches = await planFixes(scanned);
    if (patches.length === 0) {
      process.stderr.write("No deterministic fixes found.\n");
      return 0;
    }
    if (args.includes("--branch")) {
      const applied = await applyOnBranch(pathArgument, patches);
      process.stderr.write(`Committed ${applied.files.length} file${applied.files.length === 1 ? "" : "s"} on branch ${applied.branch} (${applied.commit}). Nothing was pushed; undo with: git branch -D ${applied.branch}\n`);
      process.stderr.write(renderVerification(verifyFix(scanned, await scanRepository(pathArgument, builtInDetectors))));
      return 0;
    }
    process.stdout.write(renderPatches(patches));
    process.stderr.write(`${patches.length} patch${patches.length === 1 ? "" : "es"} printed; nothing was written. Apply with: evergreen fix | git apply\n`);
    return 0;
  }
  const minSupportValue = optionValue("--min-support-days");
  const minSupportDays = minSupportValue === undefined ? undefined : parseMinSupportDays(minSupportValue);
  if (minSupportValue !== undefined && minSupportDays === undefined) {
    return fail("usage", "--min-support-days must be a whole number of days (0 to 3650).");
  }
  let result = await scanRepository(pathArgument, builtInDetectors);
  if (asOfValue !== undefined) result = await applyAsOf(result, asOfValue);
  if (minSupportDays !== undefined) result = applyMinSupport(result, minSupportDays, asOfValue ?? new Date().toISOString().slice(0, 10));
  if (command === "baseline") {
    const output = resolve(optionValue("--output") ?? ".evergreen-baseline.json");
    // A missing or unreadable earlier file just means there is no history to carry forward.
    const previous = await readBaseline(output).catch(() => undefined);
    const baseline = createBaseline(result, {}, previous ?? {
      schemaVersion: "evergreen.baseline.v1",
      createdAt: "",
      findings: [],
    });
    await writeBaseline(output, baseline);
    process.stdout.write(`Wrote ${baseline.findings.length} findings to ${output}\n${debtTrendLine(baseline.history ?? [])}\n`);
    return 0;
  }
  let baselineExpiredFailure = false;
  const baselinePaths = optionValues("--baseline");
  if (baselinePaths.length > 0) {
    const today = asOfValue ?? new Date().toISOString().slice(0, 10);
    const warnValue = optionValue("--baseline-warn-days");
    const warnWithinDays = warnValue === undefined ? DEFAULT_WARN_DAYS : Number(warnValue);
    const onExpired = (optionValue("--on-expired") ?? "resurface") as ExpiredPolicy;
    if (!isIsoDate(today) || !Number.isInteger(warnWithinDays) || warnWithinDays < 0 || warnWithinDays > 365 || !expiredPolicies.includes(onExpired)) {
      return fail("usage", `--today must be a date (YYYY-MM-DD), --baseline-warn-days a whole number from 0 to 365, and --on-expired one of ${expiredPolicies.join(", ")}.`);
    }
    let baseline: Awaited<ReturnType<typeof readBaselines>>;
    try {
      baseline = await readBaselines(baselinePaths.map((path) => resolve(path)));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return failActionable("parse", invalidConfig(detail));
    }
    const evaluated = evaluateBaseline(result, baseline, { today, warnWithinDays, onExpired });
    result = evaluated.result;
    baselineExpiredFailure = expiredSuppressionsFail(onExpired, evaluated.expired);
  }
  if (command === "context") {
    try {
      const packet = createMigrationPacket(result, findingId!, await bundledRules(), await readPinnedRuntimes(result.root));
      process.stdout.write(`${json ? JSON.stringify(packet, null, 2) : renderMigrationPacketText(packet)}\n`);
    } catch (error) {
      return fail("data", error instanceof Error ? error.message : String(error));
    }
  } else if (command === "report-issue") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      return fail("data", `Finding not found: ${findingId}`);
    }
    try {
      const report = await createIssueReport(pathArgument, finding);
      const output = optionValue("--output");
      if (output) {
        const destination = resolve(output);
        await writeFile(destination, report);
        process.stdout.write(`Wrote the report to ${destination}. Review it before you open an issue; Evergreen never opens one.\n`);
      } else {
        process.stdout.write(`${report}\n`);
      }
    } catch (error) {
      if (error instanceof ReportIssueError) return fail("data", error.message);
      throw error;
    }
  } else if (command === "explain") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      return fail("data", `Finding not found: ${findingId}`);
    }
    process.stdout.write(`${json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  } else if (args.includes("--interactive") && !json && format === "text" && canBrowse(process.stdin, process.stdout)) {
    await browseFindings(result, { input: process.stdin, output: process.stdout });
  } else if (command === "scan" && args.includes("--by-owner")) {
    if (format !== undefined && format !== "text" && format !== "json") return fail("usage", "--by-owner supports --json and --format text|json only.");
    const groups = await groupScanByOwner(result);
    process.stdout.write(`${json ? JSON.stringify(groups, null, 2) : renderOwnerGroupsText(groups)}\n`);
  } else {
    const output = format === "sarif" ? renderSarif(result) : format === "rdjson" ? renderRdjson(result) : format === "codequality" ? renderCodeQuality(result) : format === "compact" ? renderCompact(result) : format === "html" ? renderHtml(result) : format === "markdown" ? renderMarkdown(result) : format === "junit" ? renderJunit(result) : format === "slack" ? renderSlack(result) : format === "teams" ? renderTeams(result) : format === "webhook" ? renderWebhook(result) : json ? renderJson(result) : renderText(result, { firstRun: command === "scan" && !(await hasPersonalConfig()) });
    process.stdout.write(`${output}\n`);
    if (args.includes("--write-status")) {
      const statusRoot = resolve(pathArgument);
      await writeStatusFile(statusRoot, result);
      process.stderr.write(`Wrote ${STATUS_FILE_NAME} in ${statusRoot}.\n`);
    }
  }
  if (baselineExpiredFailure) {
    return fail("policy", "Failing because a baseline suppression has expired (--on-expired fail).");
  }
  if (command === "scan" && scanGate !== "none") {
    const blocking = result.findings.filter((finding) => severityValues.indexOf(finding.severity) >= severityValues.indexOf(scanGate as Severity));
    if (blocking.length > 0) return fail("policy", `${blocking.length} finding${blocking.length === 1 ? "" : "s"} at ${scanGate} or above (--fail-on ${scanGate}).`);
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const { message, appendix } = unexpectedFailure(error, debugErrors || process.argv.includes("--debug"));
  process.exitCode = fail("internal", message, appendix);
}
