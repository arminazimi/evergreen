import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFile(resolve(path), "utf8");

test("docs/RELEASING.md only names npm scripts that exist", async () => {
  const text = await read("docs/RELEASING.md");
  const { scripts } = JSON.parse(await read("package.json")) as { scripts: Record<string, string> };
  const named = new Set([...text.matchAll(/npm run ([a-z][a-z:-]*)/g)].map((match) => match[1]!));
  assert.ok(named.size >= 6);
  for (const script of named) assert.ok(scripts[script], `npm run ${script} does not exist`);
});

test("docs/RELEASING.md links to files and workflows that exist", async () => {
  const text = await read("docs/RELEASING.md");
  for (const link of new Set([...text.matchAll(/\]\(([A-Za-z0-9_./-]+\.md)\)/g)].map((match) => match[1]!))) {
    await access(resolve("docs", link));
  }
  for (const path of ["CHANGELOG.md", "benchmarks/thresholds.json", "registry/sources.lock.json", "dist/action/index.js"]) {
    assert.ok(text.includes(path), `${path} should be covered`);
    await access(resolve(path));
  }
});

test("the publish workflow uses trusted publishing with least privilege and guards the tag", async () => {
  const { parse } = await import("yaml");
  const text = await read(".github/workflows/publish.yml");
  const workflow = parse(text) as {
    on: { push: { tags: string[] } };
    permissions: unknown;
    jobs: { publish: { permissions: Record<string, string>; steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> } };
  };
  // Only version tags trigger it, nothing is granted by default, and the job can only read code and mint the OIDC token.
  assert.ok(workflow.on.push.tags.every((tag) => tag.startsWith("v")));
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: "read", "id-token": "write" });
  // No stored npm credential, npm new enough for trusted publishing, and a provenance attestation.
  assert.doesNotMatch(text, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
  const node = workflow.jobs.publish.steps.find((step) => step.uses?.startsWith("actions/setup-node"));
  assert.ok(Number(node?.with?.["node-version"]) >= 24, "Node 24 ships npm 11.5.1 or newer");
  const run = workflow.jobs.publish.steps.map((step) => step.run ?? "").join("\n");
  assert.match(run, /npm publish --provenance --access public --tag next/);
  assert.match(run, /\*\)\s+npm publish --provenance --access public ;;/);
  // It refuses a tag that disagrees with package.json and a commit that is not on main.
  assert.match(run, /GITHUB_REF_NAME/);
  assert.match(run, /merge-base --is-ancestor/);
  // The docs name the same workflow file the npm setup refers to.
  const docs = await read("docs/RELEASING.md");
  assert.match(docs, /workflow filename `publish\.yml`/);
  await access(resolve(".github/workflows/publish.yml"));
});

test("the release steps include publishing to the MCP Registry, after npm", async () => {
  const docs = await read("docs/RELEASING.md");
  const npmStep = docs.indexOf("**Publish to npm.**");
  const registryStep = docs.indexOf("**Publish to the MCP Registry.**");
  assert.ok(npmStep !== -1 && registryStep > npmStep, "registry step comes after the npm step");
  assert.match(docs, /mcp-publisher login github/);
  assert.match(docs, /mcp-publisher publish/);
});

test("every place that carries the release version agrees with package.json", async () => {
  const version = (JSON.parse(await read("package.json")) as { version: string }).version;
  const { VERSION } = await import("../src/version.js");
  assert.equal(VERSION, version, "src/version.ts");
  const server = JSON.parse(await read("server.json")) as { version: string; packages: Array<{ version: string }> };
  assert.equal(server.version, version, "server.json version");
  for (const entry of server.packages) assert.equal(entry.version, version, "server.json package version");
  const pins = [
    "examples/agents/kilo/kilo.jsonc",
    "examples/agents/gemini/settings.json",
    "examples/agents/gemini/gemini-extension.json",
    "examples/agents/copilot/.vscode/mcp.json",
    "examples/agents/cursor/.cursor/mcp.json",
    "examples/agents/copilot/coding-agent-mcp.json",
    "integrations/cline/cline_mcp_settings.json",
    "integrations/claude-code/pre-install-guard.mjs",
  ];
  for (const path of pins) assert.match(await read(path), new RegExp(`evergreen-deprecation@${version.replace(/\./g, "\\.")}`), path);
  assert.match(await read("README.md"), new RegExp(`arminazimi/evergreen@v${version.replace(/\./g, "\\.")}`));
});
