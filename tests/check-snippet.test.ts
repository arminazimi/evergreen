import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import type { ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine/index.js";
import {
  CHECK_SNIPPET_SCHEMA_VERSION,
  MAX_SNIPPET_CONTENT_BYTES,
  MAX_SNIPPET_PATH_LENGTH,
  NO_FINDINGS_MESSAGE,
  SnippetInputError,
  checkSnippet,
  snippetInputProblem,
} from "../src/check-snippet.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test("a Dockerfile pinning node:16 is flagged at its snippet path", async () => {
  const check = await checkSnippet({ path: "Dockerfile", content: "FROM node:16\nRUN make test\n" });
  assert.equal(check.schemaVersion, CHECK_SNIPPET_SCHEMA_VERSION);
  assert.equal(check.path, "Dockerfile");
  assert.ok(check.findings.length > 0, "node:16 is past end of life");
  for (const finding of check.findings) {
    assert.equal(finding.location.path, "Dockerfile", "the location is relative to the snippet");
    assert.ok(finding.location.line === undefined || finding.location.line >= 1);
  }
  assert.ok(check.findings.some((finding) => finding.ruleId === "container.node.eol-21-and-older"));
  const expected = `${check.findings.length} lifecycle finding${check.findings.length === 1 ? "" : "s"} in this snippet.`;
  assert.equal(check.message, expected);
});

test("a workflow pinning actions/checkout@v2 is flagged with the snippet-relative path and line", async () => {
  const check = await checkSnippet({
    path: ".github/workflows/ci.yml",
    content: "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v2\n",
  });
  const checkout = check.findings.find((finding) => finding.ruleId === "github-actions.checkout.node20");
  assert.ok(checkout, "the checkout rule fired");
  assert.equal(checkout.location.path, ".github/workflows/ci.yml");
  assert.equal(checkout.location.line, 4, "the line counts from the top of the snippet");
});

test("a clean snippet carries the no-findings message and no findings", async () => {
  const check = await checkSnippet({
    path: "package.json",
    content: JSON.stringify({ name: "app", version: "1.0.0" }),
  });
  assert.deepEqual(check.findings, []);
  assert.equal(check.message, NO_FINDINGS_MESSAGE);
});

test("paths that are absolute, climb out, or are too long are rejected, and so is oversized content", async () => {
  assert.match(snippetInputProblem("/etc/hosts", "x")!, /must be relative/);
  assert.match(snippetInputProblem("C:\\tmp\\Dockerfile", "x")!, /must be relative/);
  assert.match(snippetInputProblem("../Dockerfile", "x")!, /must stay inside/);
  assert.match(snippetInputProblem("a/../../Dockerfile", "x")!, /must stay inside/);
  assert.match(snippetInputProblem("a".repeat(MAX_SNIPPET_PATH_LENGTH + 1), "x")!, /256 characters/);
  assert.match(snippetInputProblem("Dockerfile", "x".repeat(MAX_SNIPPET_CONTENT_BYTES + 1))!, /larger than/);
  assert.equal(snippetInputProblem(".github/workflows/ci.yml", "x"), undefined);
  await assert.rejects(checkSnippet({ path: "../Dockerfile", content: "x" }), SnippetInputError);
  await assert.rejects(checkSnippet({ path: "/Dockerfile", content: "x" }), SnippetInputError);
  await assert.rejects(
    checkSnippet({ path: "Dockerfile", content: "x".repeat(MAX_SNIPPET_CONTENT_BYTES + 1) }),
    SnippetInputError,
  );
});

test("the temporary directory is removed even when the scan throws, and the scan never sees the repository", async () => {
  const seenRoots: string[] = [];
  const failingScan = async (root: string): Promise<ScanResult> => {
    seenRoots.push(root);
    throw new Error("detector exploded");
  };
  await assert.rejects(
    checkSnippet({ path: "Dockerfile", content: "FROM node:16\n" }, { scan: failingScan }),
    /detector exploded/,
  );
  assert.equal(seenRoots.length, 1);
  const scannedRoot = resolve(seenRoots[0]!);
  assert.ok(scannedRoot.startsWith(resolve(tmpdir())), "the scan reads a temporary directory");
  assert.ok(!scannedRoot.startsWith(process.cwd()), "the scan never runs against the working repository");
  assert.equal(existsSync(scannedRoot), false, "the temporary directory is removed after a throwing scan");
});

test("a check leaves the working repository untouched", async () => {
  const repository = await mkdtemp(join(tmpdir(), "evergreen-check-snippet-repo-"));
  temporaryRoots.push(repository);
  await writeFile(join(repository, "app.py"), "print('hello')\n");
  const snapshot = async (): Promise<string[]> => {
    const entries: string[] = [];
    for (const entry of await readdir(repository, { withFileTypes: true })) {
      const path = join(repository, entry.name);
      entries.push(
        entry.isDirectory()
          ? `dir ${entry.name}`
          : `file ${entry.name} ${createHash("sha256")
              .update(await readFile(path))
              .digest("hex")}`,
      );
    }
    return entries.sort();
  };
  const before = await snapshot();
  const previousCwd = process.cwd();
  process.chdir(repository);
  try {
    await checkSnippet({ path: "Dockerfile", content: "FROM node:16\n" });
    assert.deepEqual(await snapshot(), before);
    assert.equal(existsSync(join(repository, "Dockerfile")), false, "the snippet is not written into the repository");
  } finally {
    process.chdir(previousCwd);
  }
});

test("the snippet is the only file the scan sees, at the intended relative path", async () => {
  const seenPaths: string[] = [];
  const recordingScan = async (root: string): Promise<ScanResult> => {
    for (const entry of await readdir(root, { recursive: true })) {
      seenPaths.push(entry.toString().replaceAll("\\", "/"));
    }
    return scanRepository(root, builtInDetectors);
  };
  const check = await checkSnippet(
    { path: ".github/workflows/ci.yml", content: "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v2\n" },
    { scan: recordingScan },
  );
  assert.ok(
    seenPaths.includes(".github/workflows/ci.yml"),
    `the snippet was written at its relative path: ${seenPaths.join(", ")}`,
  );
  assert.equal(check.path, ".github/workflows/ci.yml");
  assert.ok(check.findings.length > 0);
});
