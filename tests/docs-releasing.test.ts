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
