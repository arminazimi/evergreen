import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { importers } from "../tools/importers/index.js";

const read = (path: string) => readFile(resolve(path), "utf8");

test("docs/IMPORTERS.md lists every registered importer with its registry", async () => {
  const text = await read("docs/IMPORTERS.md");
  const rows = new Map([...text.matchAll(/^\| `([a-z0-9-]+)` \| `([a-z0-9-]+)` \|/gm)].map((match) => [match[1]!, match[2]!]));
  assert.deepEqual([...rows.keys()].sort(), importers.map((importer) => importer.id).sort());
  for (const importer of importers) assert.equal(rows.get(importer.id), importer.ecosystem, importer.id);
});

test("every command and file path in docs/IMPORTERS.md exists", async () => {
  const text = await read("docs/IMPORTERS.md");
  for (const script of new Set([...text.matchAll(/node (dist\/tools\/importers\/[a-z-]+\.js)/g)].map((match) => match[1]!))) {
    await access(resolve(script));
  }
  for (const path of new Set([...text.matchAll(/`(tools\/importers\/[a-z-]+\.ts|tests\/importers\/[A-Za-z<>./-]+)`/g)].map((match) => match[1]!))) {
    if (path.includes("<")) continue;
    await access(resolve(path));
  }
  for (const link of new Set([...text.matchAll(/\]\((\.\.\/[^)#]+|[A-Za-z0-9_./-]+\.md)[^)]*\)/g)].map((match) => match[1]!))) {
    await access(resolve("docs", link));
  }
});

test("the candidate lists the doc names are the ones the importers use", async () => {
  const text = await read("docs/IMPORTERS.md");
  for (const file of ["npm-candidates", "pypi-candidates", "github-actions-candidates"]) {
    assert.ok(text.includes(`tools/importers/${file}.ts`), file);
    await access(resolve(`tools/importers/${file}.ts`));
  }
});

test("other docs point to the importer guide", async () => {
  assert.match(await read("docs/index.md"), /\(IMPORTERS\.md\)/);
  assert.match(await read("docs/RULES.md"), /\(IMPORTERS\.md\)/);
  assert.match(await read("CONTRIBUTING.md"), /docs\/IMPORTERS\.md/);
});

/**
 * Registered importers that stay out of `.github/workflows/importers.yml` even when their
 * registry file exists: their source rejects automated fetches (android-1), or no detector
 * or registry test can use the rules they draft yet (kubernetes-2, rust-2), so a weekly pull
 * request would only be noise. Keep them in `tools/importers/index.ts` for local `--replay`
 * / hand runs. Document each row in docs/IMPORTERS.md.
 */
const UNSCHEDULED_IMPORTERS = new Set(["android-1", "kubernetes-2", "rust-2"]);

test("the weekly workflow runs every schedulable importer whose registry file exists, and nothing else", async () => {
  const { existsSync } = await import("node:fs");
  const { parse } = await import("yaml");
  const workflow = parse(await read(".github/workflows/importers.yml")) as {
    permissions: unknown;
    jobs: {
      draft: { permissions: Record<string, string>; strategy: { matrix: { include: Array<{ importer: string; ecosystem: string }> } } };
      propose: { permissions: Record<string, string>; strategy: { matrix: { importer: string[] } } };
    };
  };
  for (const id of UNSCHEDULED_IMPORTERS) {
    assert.ok(importers.some((importer) => importer.id === id), `${id} must stay registered for local runs`);
  }
  const expected = importers
    .filter((importer) => existsSync(resolve(`registry/${importer.ecosystem}.json`)) && !UNSCHEDULED_IMPORTERS.has(importer.id))
    .map((importer) => [importer.id, importer.ecosystem])
    .sort();
  const drafted = workflow.jobs.draft.strategy.matrix.include.map((entry) => [entry.importer, entry.ecosystem]).sort();
  assert.deepEqual(drafted, expected);
  assert.deepEqual([...workflow.jobs.propose.strategy.matrix.importer].sort(), expected.map(([id]) => id));
  for (const id of UNSCHEDULED_IMPORTERS) {
    assert.ok(!drafted.some(([importerId]) => importerId === id), `${id} must not be in the draft matrix`);
  }
  // Least privilege: nothing by default, read-only drafting, and write access only where the pull request is opened.
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs.draft.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.propose.permissions, { contents: "write", "pull-requests": "write" });
});
