// Maintainer-only network tool. It is intentionally not wired into scans or npm run check.
//
//   npm run build --silent
//   node dist/tools/github-actions-shas.js --out registry/github-actions-shas.json

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chooseTag } from "./sha-tags.js";

const SCHEMA_VERSION = "evergreen.github-actions-shas.v1";
const EXACT_VERSION = /^v\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;

interface GitHubTag {
  name: string;
  commit: { sha: string };
}

interface GitHubActionsRegistry {
  rules: Array<{ "x-github-actions"?: { action?: string } }>;
}

interface Arguments {
  out?: string;
}

function parseArguments(argv: string[]): Arguments {
  if (argv.length === 0) return {};
  if (argv.length === 2 && argv[0] === "--out" && argv[1]) return { out: argv[1] };
  throw new Error("Usage: github-actions-shas [--out <path>]");
}

function requestHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "evergreen-sha-map-maintainer-tool",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function tags(action: string): Promise<GitHubTag[]> {
  const results: GitHubTag[] = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${action}/tags?per_page=100&page=${page}`;
    const response = await fetch(url, { headers: requestHeaders() });
    if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
    const batch = await response.json() as GitHubTag[];
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}

async function coveredActions(): Promise<string[]> {
  const registry = JSON.parse(
    await readFile(resolve("registry/github-actions.json"), "utf8"),
  ) as GitHubActionsRegistry;
  return [...new Set(
    registry.rules
      .map((rule) => rule["x-github-actions"]?.action?.toLowerCase())
      .filter((action): action is string => action !== undefined),
  )];
}

async function buildShaRegistry(): Promise<{
  schemaVersion: typeof SCHEMA_VERSION;
  actions: Record<string, Record<string, string>>;
}> {
  const actions: Record<string, Record<string, string>> = {};
  for (const action of await coveredActions()) {
    const versions = new Map<string, string>();
    for (const tag of await tags(action)) {
      const sha = tag.commit.sha.toLowerCase();
      if (!EXACT_VERSION.test(tag.name) || !SHA.test(sha)) continue;
      const existing = versions.get(sha);
      versions.set(sha, existing && existing !== tag.name ? chooseTag(action, sha, existing, tag.name) : tag.name);
    }
    actions[action] = Object.fromEntries(
      [...versions].sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return { schemaVersion: SCHEMA_VERSION, actions };
}

async function main(): Promise<void> {
  const { out } = parseArguments(process.argv.slice(2));
  const contents = `${JSON.stringify(await buildShaRegistry(), null, 2)}\n`;
  if (out) {
    await writeFile(resolve(out), contents);
    process.stdout.write(`Wrote ${out}\n`);
  } else {
    process.stdout.write(contents);
  }
}

await main();
