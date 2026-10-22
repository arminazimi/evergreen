import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { GitHubActionsDetector } from "../src/detectors/github-actions.js";

const PINNED = /^[\w./-]+@[0-9a-f]{40}\s+#\s*v\d+(?:\.\d+){0,2}\s*$/;

/** Every non-local `uses:` reference in a workflow that is not a full SHA with a trailing version comment. */
function floatingReferences(contents: string): string[] {
  const floating: string[] = [];
  for (const line of contents.split("\n")) {
    const match = /^\s*(?:-\s+)?uses:\s*["']?(\S+?)["']?(\s+#.*)?$/.exec(line);
    if (!match || match[1]!.startsWith("./")) continue;
    if (!PINNED.test(`${match[1]}${match[2] ?? ""}`)) floating.push(line.trim());
  }
  return floating;
}

const workflowsDirectory = resolve(".github/workflows");

test("this repository's workflows pin every action to a full SHA with a version comment", async () => {
  const names = (await readdir(workflowsDirectory)).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(names.length > 0);
  for (const name of names) {
    assert.deepEqual(floatingReferences(await readFile(join(workflowsDirectory, name), "utf8")), [], name);
  }
});

test("the self-scan reports no unclassified action reference", async () => {
  const analysis = await new GitHubActionsDetector().analyze({ root: resolve(".") });
  assert.deepEqual(analysis.unclassified ?? [], []);
});

test("a floating reference is caught, and a pinned or local one is not", () => {
  const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
  assert.deepEqual(floatingReferences(`      - uses: actions/checkout@v7\n`), ["- uses: actions/checkout@v7"]);
  assert.deepEqual(floatingReferences(`      - uses: actions/checkout@main\n`), ["- uses: actions/checkout@main"]);
  assert.deepEqual(floatingReferences(`      - uses: actions/checkout@${sha}\n`), [`- uses: actions/checkout@${sha}`]);
  assert.deepEqual(floatingReferences(`      - uses: actions/checkout@${sha} # v7\n`), []);
  assert.deepEqual(floatingReferences(`        uses: ./\n`), []);
});

test("an unclassified SHA pin in a scanned workflow is reported", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-self-scan-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${"0".repeat(40)}\n`);
    const analysis = await new GitHubActionsDetector().analyze({ root });
    assert.equal(analysis.unclassified?.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
