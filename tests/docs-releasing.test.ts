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
