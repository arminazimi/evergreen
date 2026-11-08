import { readFile } from "node:fs/promises";
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";
import type { YAMLMap, Scalar } from "yaml";

import { loadDataFile } from "@velella/ebb/data-source";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { DetectorFinding } from "../sdk.js";
import { sourceFiles } from "../source-files.js";

export const workflowCommandFiles = {
  "set-output": "GITHUB_OUTPUT",
  "save-state": "GITHUB_STATE",
  "set-env": "GITHUB_ENV",
  "add-path": "GITHUB_PATH",
} as const;
export type WorkflowCommand = keyof typeof workflowCommandFiles;
export const workflowCommandPrefix = "github-actions.workflow-command.";

export interface WorkflowRunLine {
  line: number;
  script: string;
  shell: string;
  start: number;
  end: number;
  inline: boolean;
  editable: boolean;
}

/** Removes shell comments without mistaking a quoted # for a comment. No shell code is evaluated. */
function withoutComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\" && quote !== "'") {
      index++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === "#" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) return line.slice(0, index);
  }
  return line;
}

export function commandsOnLine(script: string): WorkflowCommand[] {
  const found = new Set<WorkflowCommand>();
  for (const match of withoutComment(script).matchAll(/::(set-output|save-state|set-env|add-path)(?=\s|::)/g)) {
    const command = match[1];
    if (command && isWorkflowCommand(command)) found.add(command);
  }
  return [...found];
}

function defaultShell(map: YAMLMap): unknown {
  return map.getIn(["defaults", "run", "shell"]);
}

function runnerShell(job: YAMLMap): string {
  const runner = job.get("runs-on");
  return typeof runner === "string" && /^(?:ubuntu|macos)-[\w.-]+$/.test(runner) ? "bash" : "";
}

function stepRuns(steps: unknown, shell: unknown): Array<{ run: Scalar<string>; shell: string }> {
  if (!isSeq(steps)) return [];
  return steps.items.flatMap((step) => {
    if (!isMap(step)) return [];
    const run = step.get("run", true);
    if (!isStringScalar(run)) return [];
    const effective = step.has("shell") ? step.get("shell") : shell;
    return [{ run, shell: typeof effective === "string" ? effective : "" }];
  });
}

function runsIn(map: YAMLMap, composite: boolean): Array<{ run: Scalar<string>; shell: string }> {
  if (composite) {
    const runs = map.get("runs", true);
    return isMap(runs) && runs.get("using") === "composite" ? stepRuns(runs.get("steps", true), "") : [];
  }
  const jobs = map.get("jobs", true);
  if (!isMap(jobs)) return [];
  return jobs.items.flatMap(({ value: job }) => {
    if (!isMap(job)) return [];
    return stepRuns(job.get("steps", true), defaultShell(job) ?? defaultShell(map) ?? runnerShell(job));
  });
}

/** Exact source spans allow the fixer to change a scalar without serializing the surrounding workflow. */
function runLines(run: Scalar<string>, shell: string, contents: string, counter: LineCounter): WorkflowRunLine[] {
  if (!run.range) return [];
  const [start, end] = run.range;
  const firstLine = counter.linePos(start).line;
  const block = run.type === "BLOCK_LITERAL" || run.type === "BLOCK_FOLDED";
  const raw = contents.slice(start, end);
  const safe = !/\\\r?\n|<<|\$\{\{/.test(run.value) && run.value.split(/\r?\n/).every(balancedQuotes);
  if (!block && !raw.includes("\n")) {
    return [{ line: firstLine, script: run.value, shell, start, end, inline: true, editable: safe }];
  }
  let offset = start;
  return raw.split("\n").flatMap((text, index) => {
    const position = offset;
    offset += text.length + 1;
    if (block && index === 0) return [];
    const indent = text.length - text.trimStart().length;
    return [
      {
        line: firstLine + index,
        script: text.trim(),
        shell,
        start: position + indent,
        end: position + text.replace(/\r$/, "").length,
        inline: false,
        editable: safe && run.type === "BLOCK_LITERAL",
      },
    ];
  });
}

function balancedQuotes(line: string): boolean {
  let quote = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\" && quote !== "'") {
      index++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(line[index - 1] ?? ""))) break;
  }
  return quote === "";
}

export function workflowRunLines(contents: string, composite: boolean): WorkflowRunLine[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  return runsIn(document.contents, composite).flatMap(({ run, shell }) => runLines(run, shell, contents, lineCounter));
}

export function isWorkflowCommandPath(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) || /(?:^|\/)action\.ya?ml$/i.test(path);
}

export async function workflowCommandFindings(root: string): Promise<DetectorFinding[]> {
  const rules = validateRegistryV2(await loadDataFile("registry/github-actions.json")).rules;
  const files = await sourceFiles(root, { include: (language) => language === "yaml" });
  const findings: DetectorFinding[] = [];
  for (const file of files
    .filter((file) => isWorkflowCommandPath(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))) {
    const contents = await readFile(file.absolutePath, "utf8");
    for (const entry of workflowRunLines(contents, !file.path.startsWith(".github/workflows/"))) {
      for (const command of commandsOnLine(entry.script)) {
        const rule = rules.find((rule) => rule.id === `${workflowCommandPrefix}${command}`);
        if (!rule) continue;
        findings.push({
          id: `${rule.id}:${file.path}:${entry.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary: rule.summary,
          severity: rule.severity,
          location: { path: file.path, line: entry.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
        });
      }
    }
  }
  return findings;
}

function isWorkflowCommand(value: string): value is WorkflowCommand {
  return Object.hasOwn(workflowCommandFiles, value);
}

function isStringScalar(value: unknown): value is Scalar<string> {
  return isScalar(value) && typeof value.value === "string";
}
