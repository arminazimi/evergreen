/**
 * Offline validator for `benchmarks/agent-guardrail/tasks.json`.
 *
 * Each task asks an agent to add a deprecated or end-of-life package. This module
 * checks that every task names a real registry rule and that checking the Package
 * URL against the bundled registries reports it as affected, with the same
 * replacement the task records. No network is used.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { checkAgainst } from "../../src/check-dependency.js";
import { validateRegistryV2 } from "../../src/registry.js";
import type { RegistryV2Rule } from "../../src/registry.js";

export const SCHEMA_VERSION = "evergreen.agent-guardrail.v1" as const;
export const EXPECTED_TASK_COUNT = 20;

export interface GuardrailTask {
  id: string;
  request: string;
  purl: string;
  ruleId: string;
  replacement: string;
}

export interface GuardrailTasksFile {
  schemaVersion: typeof SCHEMA_VERSION;
  tasks: GuardrailTask[];
}

export interface TaskValidationIssue {
  taskId: string;
  message: string;
}

export interface GuardrailValidationResult {
  ok: boolean;
  taskCount: number;
  issues: TaskValidationIssue[];
}

const SKIP_REGISTRY_FILES = new Set(["sources.lock.json", "github-actions-shas.json"]);

/** Loads every lifecycle rule from `registry/*.json` under `root`. */
export function loadBundledRegistryRules(root = process.cwd()): RegistryV2Rule[] {
  const directory = resolve(root, "registry");
  const rules: RegistryV2Rule[] = [];
  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".json") || SKIP_REGISTRY_FILES.has(file)) continue;
    const document = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as unknown;
    rules.push(...validateRegistryV2(document).rules);
  }
  return rules;
}

/** Reads and parses the guardrail task file. */
export function loadGuardrailTasks(tasksPath = resolve("benchmarks/agent-guardrail/tasks.json")): GuardrailTasksFile {
  const file = JSON.parse(readFileSync(tasksPath, "utf8")) as GuardrailTasksFile;
  return file;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the guardrail tasks against the bundled registry and the offline check.
 * Returns every issue found; an empty `issues` list means the file is ready to score.
 */
export function validateGuardrailTasks(
  file: GuardrailTasksFile = loadGuardrailTasks(),
  rules: readonly RegistryV2Rule[] = loadBundledRegistryRules(),
): GuardrailValidationResult {
  const issues: TaskValidationIssue[] = [];
  const push = (taskId: string, message: string): void => {
    issues.push({ taskId, message });
  };

  if (file.schemaVersion !== SCHEMA_VERSION) {
    push("*", `schemaVersion must be ${SCHEMA_VERSION}, got ${String(file.schemaVersion)}`);
  }
  if (!Array.isArray(file.tasks)) {
    push("*", "tasks must be an array");
    return { ok: false, taskCount: 0, issues };
  }
  if (file.tasks.length !== EXPECTED_TASK_COUNT) {
    push("*", `expected ${EXPECTED_TASK_COUNT} tasks, found ${file.tasks.length}`);
  }

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const seenIds = new Set<string>();
  const seenPurls = new Set<string>();

  for (const task of file.tasks) {
    const taskId = isNonEmptyString(task?.id) ? task.id : "(missing-id)";

    if (!isNonEmptyString(task?.id)) {
      push(taskId, "id is required");
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.id)) {
      push(taskId, "id must be kebab-case");
    }
    if (seenIds.has(task.id)) push(taskId, "duplicate task id");
    seenIds.add(task.id);

    if (!isNonEmptyString(task.request)) push(taskId, "request is required");
    if (!isNonEmptyString(task.purl)) push(taskId, "purl is required");
    if (!isNonEmptyString(task.ruleId)) push(taskId, "ruleId is required");
    if (!isNonEmptyString(task.replacement)) push(taskId, "replacement is required");
    if (!isNonEmptyString(task.purl) || !isNonEmptyString(task.ruleId) || !isNonEmptyString(task.replacement)) {
      continue;
    }

    if (seenPurls.has(task.purl)) push(taskId, `duplicate purl ${task.purl}`);
    seenPurls.add(task.purl);

    const rule = ruleById.get(task.ruleId);
    if (!rule) {
      push(taskId, `ruleId ${task.ruleId} is not in the bundled registry`);
      continue;
    }
    if (rule.purl !== task.purl) {
      push(taskId, `purl ${task.purl} does not match rule ${task.ruleId} (${rule.purl})`);
    }
    if (rule.replacement !== task.replacement) {
      push(
        taskId,
        `replacement does not match rule ${task.ruleId}: expected ${JSON.stringify(rule.replacement)}, got ${JSON.stringify(task.replacement)}`,
      );
    }

    let check;
    try {
      check = checkAgainst(rules, { purl: task.purl });
    } catch (error) {
      push(taskId, `check failed for ${task.purl}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (check.status !== "affected") {
      push(taskId, `check reports ${task.purl} as ${check.status}, expected affected`);
      continue;
    }
    const finding = check.findings.find((candidate) => candidate.ruleId === task.ruleId);
    if (!finding) {
      push(
        taskId,
        `check findings for ${task.purl} do not include ${task.ruleId} (found ${check.findings.map((item) => item.ruleId).join(", ") || "none"})`,
      );
      continue;
    }
    if (finding.replacement !== task.replacement) {
      push(
        taskId,
        `check replacement for ${task.ruleId} is ${JSON.stringify(finding.replacement)}, expected ${JSON.stringify(task.replacement)}`,
      );
    }
  }

  return { ok: issues.length === 0, taskCount: file.tasks.length, issues };
}

async function runCli(): Promise<void> {
  const result = validateGuardrailTasks();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
