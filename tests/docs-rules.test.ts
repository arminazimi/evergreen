import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { registryV2Issues } from "../src/registry.js";

async function jsonBlocks(path: string): Promise<unknown[]> {
  const text = await readFile(resolve(path), "utf8");
  return [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]!));
}

test("the complete rule in docs/RULES.md is a valid v2 registry", async () => {
  const [example] = await jsonBlocks("docs/RULES.md");
  assert.deepEqual(registryV2Issues(example), []);
});

test("the symbol rule in docs/RULES.md matches the shipped example and is valid", async () => {
  const blocks = await jsonBlocks("docs/RULES.md");
  const example = JSON.parse(await readFile(resolve("examples/registry.v2.symbol.example.json"), "utf8"));
  assert.deepEqual(blocks[1], example);
  assert.deepEqual(registryV2Issues(example), []);
});

test("the validation error shown in docs/RULES.md matches what validation reports", async () => {
  const [registry] = (await jsonBlocks("docs/RULES.md")) as { rules: Record<string, unknown>[] }[];
  const broken = structuredClone(registry!);
  delete (broken.rules[0]!.provenance as Record<string, unknown>).reviewedAt;
  broken.rules[0]!.purl = "pkg:npm/Request";
  const issues = registryV2Issues(broken);
  assert.ok(issues.includes('rule "npm.package.request.deprecated": provenance.reviewedAt is required'));
  assert.ok(issues.includes('rule "npm.package.request.deprecated": purl must be canonical and version-less (expected "pkg:npm/request")'));
});

test("every document that CONTRIBUTING.md and docs/RULES.md link to exists", async () => {
  for (const [file, links] of [
    ["docs/RULES.md", ["../schemas/registry.v2.schema.json", "decisions/0004-registry-v2.md", "../examples/registry.v2.example.json", "../.github/workflows/sources.yml", "DETECTORS.md"]],
    ["CONTRIBUTING.md", ["docs/RULES.md", "registry/npm.json", "tests/npm.test.ts"]],
    ["docs/DETECTORS.md", ["RULES.md"]],
    ["docs/index.md", ["RULES.md"]],
  ] as const) {
    const text = await readFile(resolve(file), "utf8");
    for (const link of links) {
      assert.ok(text.includes(`(${link}`), `${file} links ${link}`);
      const target = resolve(file, "..", link.split("#")[0]!);
      await readFile(target); // throws when the target is missing
    }
  }
});
