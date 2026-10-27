// Maintainer-only network tool. It is intentionally not wired into scans or npm run check, and it
// never runs inside a scan: only repository contents there, GitHub calls here.
//
//   npm run org:rollout -- --org <org>                      # dry run: print the plan, change nothing
//   npm run org:rollout -- --apply --org <org>              # open one pull request per repository
//
// It needs the network and a token (GITHUB_TOKEN or GH_TOKEN) with repository write access. A rollout
// to many repositories is one reviewed step: the dry run is the review, and `--apply` opens pull
// requests instead of pushing directly. The generated workflow runs Evergreen lazily per pull request
// and on a schedule; it follows docs/GITHUB_ACTION.md and needs no configuration in the target repo.

import { pathToFileURL } from "node:url";

const REPOSITORY = "arminazimi/evergreen";
const WORKFLOW_PATH = ".github/workflows/evergreen.yml";
const DEFAULT_SCHEDULE = "0 4 * * 1";
const DEFAULT_BRANCH = "evergreen/lifecycle-scan";
const GITHUB_API = "https://api.github.com";
const PIN_PATTERN = /uses:\s*['"]?arminazimi\/evergreen@/;

interface RequestInit {
  body?: unknown;
  accept?: string;
}

/** One GitHub REST call. Reads the token the same way tools/github-actions-shas.ts does. */
async function githubRequest(method: string, path: string, init: RequestInit = {}): Promise<{ error?: string; data: unknown }> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: init.accept ?? "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "evergreen-org-rollout",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: `HTTP ${response.status}${detail?.message ? ` – ${detail.message}` : ""}`, data: null };
  }
  if (init.accept) return { data: await response.text() };
  return { data: await response.json().catch(() => null) };
}

export interface Repository {
  name: string;
  default_branch: string;
  archived: boolean;
  fork: boolean;
}

export type PlanEntry = { repository: string; defaultBranch: string; status: "pull-request" | "skip"; reason?: string };

export interface Arguments {
  org?: string;
  repos?: string[];
  apply: boolean;
  schedule: string;
  actionRef?: string;
  branch: string;
}

export const USAGE = `Usage: node dist/tools/org-rollout.js --org <name> | --repos <owner/name,...> [options]

Options:
  --org <name>          Open pulls for every non-archived, non-fork repository of this organization.
  --repos <list>        Comma-separated owner/name list instead of an organization.
  --apply               Open the pull requests. Without it the plan is only printed.
  --schedule <cron>     Cron expression for the weekly scan. Default: "${DEFAULT_SCHEDULE}".
  --action-ref <ref>    Action version to pin, for example v0.7.1. Defaults to the latest release.
  --branch <name>       Rollout branch name. Default: "${DEFAULT_BRANCH}".
`;

export function parseArguments(argv: string[]): Arguments {
  const args: Arguments = { apply: false, schedule: DEFAULT_SCHEDULE, branch: DEFAULT_BRANCH };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next) throw new Error(`The ${flag} option needs a value.\n${USAGE}`);
      index += 1;
      return next;
    };
    switch (flag) {
      case "--org": args.org = value(); break;
      case "--repos":
        args.repos = value().split(",").map((name) => name.trim());
        break;
      case "--apply": args.apply = true; break;
      case "--schedule": args.schedule = value(); break;
      case "--action-ref": args.actionRef = value(); break;
      case "--branch": args.branch = value(); break;
      case "--help": process.stdout.write(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${flag}.\n${USAGE}`);
    }
  }
  if (!args.org && (!args.repos || args.repos.length === 0)) {
    throw new Error(`Give --org or --repos.\n${USAGE}`);
  }
  return args;
}

/** Repositories that get a pull request: archived and fork copies are never rollout targets. */
export function rolloutTargets(repos: Repository[]): Repository[] {
  return repos.filter((repo) => !repo.archived && !repo.fork && repo.default_branch);
}

/** True when workflow text already invokes the Evergreen action. */
export function usesEvergreen(text: string): boolean {
  return PIN_PATTERN.test(text);
}

/** The generated workflow file, matching the example in docs/GITHUB_ACTION.md. */
export function workflowYaml(actionRef: string, schedule: string): string {
  const action = actionRef.replace(/[^A-Za-z0-9._/-]+/g, "");
  if (!action || action !== actionRef) throw new Error(`Unsupported action ref ${JSON.stringify(actionRef)}.`);
  return [
    "name: Evergreen lifecycle scan",
    "",
    "on:",
    "  pull_request:",
    "  schedule:",
    `    - cron: '${schedule.replace(/['\\]/g, "")}'`,
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  lifecycle:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7",
    `      - uses: arminazimi/evergreen@${action}`,
    "        with:",
    "          fail-on-severity: high",
    "",
  ].join("\n");
}

export const PULL_REQUEST_TITLE = "Scan lifecycle risks with Evergreen";

export function pullRequestBody(): string {
  return [
    `Adds \`${WORKFLOW_PATH}\` so pull requests and a weekly schedule run [Evergreen](https://github.com/${REPOSITORY}),`,
    "a local scan for deprecations, end-of-life runtimes, and retired GitHub Actions.",
    "",
    "The scan reads the checkout and never changes this repository. Findings appear as annotations,",
    "and the workflow only fails on high or critical severity. To accept current findings, commit the",
    "baseline the first report suggests:",
    "",
    "```bash",
    "npx evergreen-deprecation baseline . --output .evergreen-baseline.json",
    "```",
    "",
    `Generated by the [org rollout tool](https://github.com/${REPOSITORY}/blob/main/docs/ORG_ROLLOUT.md).`,
    "Closing it without merging skips this repository.",
  ].join("\n");
}

export function parsePlan(repos: Repository[], present: Map<string, boolean>): PlanEntry[] {
  return rolloutTargets(repos).map((repo) =>
    present.get(repo.name)
      ? { repository: repo.name, defaultBranch: repo.default_branch, status: "skip", reason: "a workflow already uses arminazimi/evergreen" }
      : { repository: repo.name, defaultBranch: repo.default_branch, status: "pull-request" },
  );
}

function encode(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

async function orgRepositories(org: string): Promise<Repository[]> {
  const repos: Repository[] = [];
  for (let page = 1; ; page += 1) {
    const body = await githubRequest("GET", `/orgs/${org}/repos?per_page=100&page=${page}`);
    if (body.error) throw new Error(`Listing repositories of ${org} failed: ${body.error}`);
    const batch = body.data as Repository[];
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

async function repositoryDefaultBranch(name: string): Promise<Repository> {
  const body = await githubRequest("GET", `/repos/${name}`);
  if (body.error) throw new Error(`Fetching ${name} failed: ${body.error}`);
  const repo = body.data as Repository;
  if (!repo.default_branch) throw new Error(`${name} reports no default branch, so a pull request has nowhere to land.`);
  return repo;
}

/** True when any workflow in the repository already invokes the Evergreen action. */
async function alreadyUsesEvergreen(name: string): Promise<boolean> {
  const body = await githubRequest("GET", `/repos/${name}/contents/.github/workflows`);
  if (body.error) return false;
  const files = (body.data as Array<{ name: string; type: string }>).filter(
    (file) => file.type === "file" && /\.(?:ya?ml)$/.test(file.name),
  );
  for (const file of files) {
    const raw = await githubRequest("GET", `/repos/${name}/contents/.github/workflows/${file.name}`, {
      accept: "application/vnd.github.raw",
    });
    if (!raw.error && PIN_PATTERN.test(String(raw.data))) return true;
  }
  return false;
}

async function latestActionRef(): Promise<string> {
  const body = await githubRequest("GET", `/repos/${REPOSITORY}/releases/latest`);
  if (body.error) {
    throw new Error(`Could not read the latest release: ${body.error}. Pass --action-ref explicitly.`);
  }
  const tag = (body.data as { tag_name?: string }).tag_name;
  if (!tag) throw new Error("The latest release has no tag. Pass --action-ref explicitly.");
  return tag;
}

/** Merge the rollout branch: created from the default branch, or reused when a previous run left it behind. */
async function ensureRolloutBranch(name: string, branch: string): Promise<void> {
  const existing = await githubRequest("GET", `/repos/${name}/git/ref/heads/${branch}`);
  if (!existing.error) return;
  const repo = await repositoryDefaultBranch(name);
  const start = await githubRequest("GET", `/repos/${name}/git/ref/heads/${repo.default_branch}`);
  if (start.error) throw new Error(`${name}: reading the default branch failed: ${start.error}`);
  const created = await githubRequest("POST", `/repos/${name}/git/refs`, {
    body: { ref: `refs/heads/${branch}`, sha: (start.data as { object: { sha: string } }).object.sha },
  });
  if (created.error) throw new Error(`${name}: creating ${branch} failed: ${created.error}`);
}

async function createWorkflowFile(name: string, branch: string, content: string): Promise<void> {
  const body = await githubRequest("PUT", `/repos/${name}/contents/${WORKFLOW_PATH}`, {
    body: {
      message: `chore: add Evergreen lifecycle scan workflow`,
      content: encode(content),
      branch,
    },
  });
  if (body.error) throw new Error(`${name}: writing ${WORKFLOW_PATH} failed: ${body.error}`);
}

/** Open the pull request and return its URL. */
async function openPullRequest(name: string, branch: string, base: string): Promise<string> {
  const body = await githubRequest("POST", `/repos/${name}/pulls`, {
    body: {
      title: PULL_REQUEST_TITLE,
      body: pullRequestBody(),
      head: branch,
      base,
    },
  });
  if (body.error) throw new Error(`${name}: opening the pull request failed: ${body.error}`);
  return (body.data as { html_url: string }).html_url;
}

function planLine(entry: PlanEntry): string {
  return entry.status === "skip"
    ? `${entry.repository}\tskip\t${entry.reason}`
    : `${entry.repository}\tpull-request`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const actionRef = args.actionRef ?? (await latestActionRef());
  const content = workflowYaml(actionRef, args.schedule);

  const repositories: Repository[] = [];
  for (const name of args.repos ?? []) {
    if (!/^[^/]+\/[^/]+$/.test(name)) throw new Error(`Expected --repos entries as owner/name, got ${JSON.stringify(name)}.`);
    repositories.push(await repositoryDefaultBranch(name));
  }
  if (args.org) repositories.push(...rolloutTargets(await orgRepositories(args.org)));

  const present = new Map<string, boolean>();
  for (const repo of repositories) present.set(repo.name, await alreadyUsesEvergreen(repo.name));
  const plan = parsePlan(repositories, present);
  for (const entry of plan) process.stdout.write(`${planLine(entry)}\n`);
  const open = plan.filter((entry) => entry.status === "pull-request");
  process.stdout.write(
    `\n${open.length} pull request${open.length === 1 ? "" : "s"} would be opened, ${plan.length - open.length} skipped\n` +
    `Action ref ${actionRef}, branch ${args.branch}, schedule ${args.schedule}\n\n` +
    `Workflow file (${WORKFLOW_PATH}):\n${content}\n`,
  );
  if (!args.apply) {
    process.stdout.write("Dry run: nothing was changed. Re-run with --apply to open the pull requests.\n");
    return;
  }

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error("A token (GITHUB_TOKEN or GH_TOKEN) with repository write access is needed for --apply.");

  const failures: string[] = [];
  for (const entry of open) {
    try {
      await ensureRolloutBranch(entry.repository, args.branch);
      await createWorkflowFile(entry.repository, args.branch, content);
      const url = await openPullRequest(entry.repository, args.branch, entry.defaultBranch);
      process.stdout.write(`${entry.repository}\t${url}\n`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      process.stderr.write(`${entry.repository}\tERROR\n`);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
