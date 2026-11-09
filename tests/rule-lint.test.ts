import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { runCli } from "./cli-runner.js";

// The rule linter itself is tested in @velella/ebb. This file tests the `rules lint` command that wraps it.

const roots: string[] = [];

after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

function validRule(id = "npm.package.sample.deprecated"): Record<string, unknown> {
  return {
    id,
    ecosystem: "npm",
    purl: "pkg:npm/sample-package",
    vers: "vers:npm/*",
    event: "deprecated",
    title: "Sample package is deprecated",
    summary: "The package is deprecated and no new changes are expected.",
    severity: "high",
    sources: [{ title: "Sample notice", url: "https://example.com/sample", accessedAt: "2026-10-01" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "tester" },
    "x-npm": { package: "sample-package" },
  };
}

function registry(rules: unknown[]): string {
  return `${JSON.stringify({ schemaVersion: "ebb.registry.v2", ecosystem: "npm", rules }, null, 2)}\n`;
}

async function registryDirectory(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rule-lint-"));
  roots.push(root);
  const directory = join(root, "registry");
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, contents]) => writeFile(join(directory, name), contents)));
  return directory;
}

test("the command exits 1 on problems, 0 on clean files, and 2 on misuse", async () => {
  const run = (args: string[], cwd: string) => runCli(args, { cwd });

  const cleanDirectory = await registryDirectory({ "npm.json": registry([validRule()]) });
  const clean = await run(["rules", "lint", join(cleanDirectory, "npm.json")], resolve("."));
  assert.equal(clean.code, 0, clean.stderr);
  assert.match(clean.stdout, /no problems\./);

  const badRule = validRule();
  (badRule.sources as Array<{ url: string }>)[0]!.url = "http://example.com/sample";
  const badDirectory = await registryDirectory({
    "npm.json": `${JSON.stringify({ schemaVersion: "ebb.registry.v2", ecosystem: "npm", rules: [badRule] }, null, 2)}\n`,
  });
  const bad = await run(["rules", "lint", join(badDirectory, "npm.json")], resolve("."));
  assert.equal(bad.code, 1, bad.stderr);
  assert.match(bad.stdout, /must be an https URL/);
  assert.match(bad.stdout, /hint: /);

  assert.equal((await run(["rules"], resolve("."))).code, 2);
  assert.equal((await run(["rules", "fix"], resolve("."))).code, 2);
  assert.equal((await run(["rules", "lint", "--json"], resolve("."))).code, 2);

  // With no files it lints registry/ in the current directory, as in a checkout of the Ebb repository.
  const checkout = await run(["rules", "lint"], dirname(cleanDirectory));
  assert.equal(checkout.code, 0, checkout.stderr);
  assert.match(checkout.stdout, /no problems\./);

  const outside = await mkdtemp(join(tmpdir(), "evergreen-rule-lint-outside-"));
  roots.push(outside);
  const missing = await run(["rules", "lint"], outside);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /No registry directory here/);
});
