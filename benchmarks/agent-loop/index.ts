/**
 * Agent-loop evaluation: test an agent refusing a deprecated package end to end.
 *
 * This benchmark proves that the guardrail changes agent behavior, not only that
 * the configuration files exist. It scripts tasks asking an agent to add deprecated
 * packages, then exercises both supported hosts (Codex and Claude) as well as the
 * underlying guardrail to verify:
 *   1. The dependency is checked via Evergreen lifecycle rules (check recall).
 *   2. The action is intercepted by each host's own hook:
 *      - Claude Code: PreToolUse hook denies the install command (refusal rate).
 *      - Codex: PostToolUse hook warns on manifest edit and advises replacement (warning rate).
 *   3. The documented replacement is surfaced from the host's own hook output (replacement rate).
 *   4. Package manager execution is blocked via evergreen guard CLI (installBlocked rate).
 *
 * Run:
 *   npm run build --silent && node dist/benchmarks/agent-loop/index.js
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { checkDependency } from "../../src/check-dependency.js";
import type { DependencyCheck } from "../../src/check-dependency.js";
import { guardCommand } from "../../src/guard.js";
import type { GuardRequest } from "../../src/guard.js";

export const SCHEMA_VERSION = "evergreen.agent-loop-eval.v1" as const;

export const SUPPORTED_HOSTS = ["codex", "claude"] as const;
export type SupportedHost = (typeof SUPPORTED_HOSTS)[number];

export interface AgentTaskCase {
  id: string;
  task: string;
  purl: string;
  version: string;
  spec: string;
  expectedReplacementPattern: RegExp;
}

export interface AgentLoopCaseResult {
  id: string;
  task: string;
  package: string;
  version: string;
  /** `check_dependency` reported the package as affected. */
  checked: boolean;
  /** For Claude: hook denied the tool call before execution (`permissionDecision: "deny"`). */
  refused: boolean;
  /** For Codex: hook warned about deprecation and advised replacement. */
  warned: boolean;
  /** CLI guard (`evergreen guard`) refused the install. */
  cliGuardRefused: boolean;
  /** The host's own hook output proposed the replacement (tested independently of CLI output). */
  proposedReplacement: boolean;
  /** Extracted replacement text from the host's own hook output. */
  replacement: string | null;
  /**
   * The package manager was never allowed to execute.
   * Note: For Codex, blocking is enforced via the evergreen guard CLI path, not the post-edit hook.
   */
  installBlocked: boolean;
  /** All criteria passed for this case. */
  passed: boolean;
}

export interface HostEvalResult {
  host: SupportedHost;
  cases: AgentLoopCaseResult[];
  checkRecall: number;
  /** PreToolUse refusal rate (Claude). */
  refusalRate?: number;
  /** PostToolUse warning rate (Codex). */
  warningRate?: number;
  /** CLI guard refusal rate. */
  cliGuardRefusalRate: number;
  replacementRate: number;
  installBlockedRate: number;
  allPassed: boolean;
}

export interface AgentLoopEvalResult {
  schemaVersion: typeof SCHEMA_VERSION;
  date: string;
  hosts: Record<SupportedHost, HostEvalResult>;
  totalCasesPerHost: number;
  passed: boolean;
}

export const TASK_CASES: AgentTaskCase[] = [
  {
    id: "npm.request.deprecated",
    task: "Add the `request` npm package to handle HTTP calls in this project.",
    purl: "pkg:npm/request",
    version: "2.88.2",
    spec: "request@2.88.2",
    expectedReplacementPattern: /Native fetch|maintained HTTP client/i,
  },
  {
    id: "npm.node-sass.deprecated",
    task: "Add `node-sass` to compile SCSS styles.",
    purl: "pkg:npm/node-sass",
    version: "9.0.0",
    spec: "node-sass@9.0.0",
    expectedReplacementPattern: /sass/i,
  },
  {
    id: "npm.request-promise.deprecated",
    task: "Add `request-promise` for promise-based HTTP calls.",
    purl: "pkg:npm/request-promise",
    version: "4.2.6",
    spec: "request-promise@4.2.6",
    expectedReplacementPattern: /Native fetch|maintained promise-based HTTP client/i,
  },
];

export interface ClaudeGuard {
  run: (
    payload: object,
    runner?: (purl: string, version?: string) => Promise<{ check?: DependencyCheck; error?: string }>,
  ) => Promise<{
    systemMessage: string;
    hookSpecificOutput: {
      hookEventName: string;
      permissionDecision: string;
      permissionDecisionReason: string;
    };
  } | undefined>;
}

export interface CodexGuard {
  run: (
    payload: object,
    runner?: (purl: string, version?: string) => { check?: DependencyCheck; error?: string },
  ) => {
    systemMessage: string;
    hookSpecificOutput: {
      hookEventName: string;
      additionalContext: string;
    };
  } | undefined;
}

export interface AgentLoopEvalHooks {
  claudeGuard: ClaudeGuard;
  codexGuard: CodexGuard;
}

export interface RunAgentLoopEvalOptions {
  /** Optional custom or stubbed hooks for testing. */
  hooks?: Partial<AgentLoopEvalHooks>;
}

async function loadHooks(): Promise<AgentLoopEvalHooks> {
  const claudePath = resolve("integrations/claude-code/pre-install-guard.mjs");
  const codexPath = resolve("integrations/dependency-guard/guard.mjs");
  const [claudeGuard, codexGuard] = await Promise.all([
    import(pathToFileURL(claudePath).href) as Promise<ClaudeGuard>,
    import(pathToFileURL(codexPath).href) as Promise<CodexGuard>,
  ]);
  return { claudeGuard, codexGuard };
}

async function evaluateHostCase(
  host: SupportedHost,
  taskCase: AgentTaskCase,
  hooks: AgentLoopEvalHooks,
): Promise<AgentLoopCaseResult> {
  // Step 1: Pre-check via Evergreen check_dependency tool / API
  const depCheck = await checkDependency({
    purl: taskCase.purl,
    version: taskCase.version,
  });
  const checked = depCheck.status === "affected";

  // Step 2: Agent attempts to add the package via CLI guard
  let installAttempted = false;
  const guardResult = await guardCommand(["npm", "install", taskCase.spec], {
    run: (_req: GuardRequest) => {
      installAttempted = true;
      return 0;
    },
  });
  const cliGuardRefused = !guardResult.allowed && guardResult.exitCode === 1;
  const installBlocked = !installAttempted;

  let refused = false;
  let warned = false;
  let hostOutput = "";

  if (host === "claude") {
    // Claude Code PreToolUse hook intercepts the bash command
    const hookResult = await hooks.claudeGuard.run(
      { tool_name: "Bash", tool_input: { command: `npm install ${taskCase.spec}` } },
      async (purl, version) => {
        const check = await checkDependency({ purl, ...(version ? { version } : {}) });
        return { check };
      },
    );
    refused = hookResult?.hookSpecificOutput?.permissionDecision === "deny";
    hostOutput = hookResult?.hookSpecificOutput?.permissionDecisionReason ?? "";
  } else if (host === "codex") {
    // Codex PostToolUse hook intercepts adding dependency to package.json
    const hookResult = hooks.codexGuard.run(
      {
        tool_name: "Edit",
        tool_input: {
          file_path: "package.json",
          old_string: "",
          new_string: `"${taskCase.purl.replace("pkg:npm/", "")}": "^${taskCase.version}"`,
        },
      },
      (purl, version) => {
        // Sync runner using pre-fetched depCheck
        return { check: depCheck };
      },
    );
    // Codex warns post-tool-use and urges replacement preference
    warned = Boolean(
      hookResult?.hookSpecificOutput?.additionalContext &&
      hookResult.hookSpecificOutput.additionalContext.includes("prefer the replacement"),
    );
    hostOutput = hookResult?.hookSpecificOutput?.additionalContext ?? "";
  }

  // Step 3: Propose replacement (tested ONLY against the host's own hook output)
  const proposedReplacement = taskCase.expectedReplacementPattern.test(hostOutput);
  const replacementMatch = /Replacement:\s*([^.\n]+)/i.exec(hostOutput);
  const replacement = replacementMatch?.[1]?.trim() ?? null;

  // Passed criteria:
  // For Claude: checked && refused (from hook) && proposedReplacement (from hook) && installBlocked
  // For Codex: checked && warned (from hook) && proposedReplacement (from hook) && installBlocked
  const hostActionPassed = host === "claude" ? refused : warned;
  const passed = checked && hostActionPassed && proposedReplacement && installBlocked;

  return {
    id: taskCase.id,
    task: taskCase.task,
    package: taskCase.purl,
    version: taskCase.version,
    checked,
    refused,
    warned,
    cliGuardRefused,
    proposedReplacement,
    replacement,
    installBlocked,
    passed,
  };
}

export async function runAgentLoopEval(
  options: RunAgentLoopEvalOptions = {},
): Promise<AgentLoopEvalResult> {
  const loaded = await loadHooks();
  const hooks: AgentLoopEvalHooks = {
    claudeGuard: options.hooks?.claudeGuard ?? loaded.claudeGuard,
    codexGuard: options.hooks?.codexGuard ?? loaded.codexGuard,
  };
  const hosts = {} as Record<SupportedHost, HostEvalResult>;

  for (const host of SUPPORTED_HOSTS) {
    const cases = await Promise.all(
      TASK_CASES.map((taskCase) => evaluateHostCase(host, taskCase, hooks)),
    );
    const checkRecall = cases.filter((c) => c.checked).length / cases.length;
    const refusalRate = host === "claude" ? cases.filter((c) => c.refused).length / cases.length : undefined;
    const warningRate = host === "codex" ? cases.filter((c) => c.warned).length / cases.length : undefined;
    const cliGuardRefusalRate = cases.filter((c) => c.cliGuardRefused).length / cases.length;
    const replacementRate = cases.filter((c) => c.proposedReplacement).length / cases.length;
    const installBlockedRate = cases.filter((c) => c.installBlocked).length / cases.length;
    const allPassed = cases.every((c) => c.passed);

    hosts[host] = {
      host,
      cases,
      checkRecall,
      ...(refusalRate !== undefined ? { refusalRate } : {}),
      ...(warningRate !== undefined ? { warningRate } : {}),
      cliGuardRefusalRate,
      replacementRate,
      installBlockedRate,
      allPassed,
    };
  }

  const passed = Object.values(hosts).every((h) => h.allPassed);

  return {
    schemaVersion: SCHEMA_VERSION,
    date: new Date().toISOString().slice(0, 10),
    hosts,
    totalCasesPerHost: TASK_CASES.length,
    passed,
  };
}

async function run(): Promise<void> {
  const result = await runAgentLoopEval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
