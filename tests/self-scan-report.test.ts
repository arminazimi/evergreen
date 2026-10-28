import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

const directory = resolve("reports");

test("each monthly self-scan report is named by month and has counts, outcomes, and other repositories", async () => {
  const reports = (await readdir(directory)).filter((name) => name !== "README.md");
  assert.ok(reports.length > 0, "the first monthly report is published");
  for (const name of reports) {
    assert.match(name, /^self-scan-\d{4}-(0[1-9]|1[0-2])\.md$/, name);
    const text = await readFile(join(directory, name), "utf8");
    assert.match(text, /^# Self-scan report: \d{4}-\d{2}$/m, name);
    assert.match(text, /^## Counts$/m, name);
    assert.match(text, /^## Outcomes$/m, name);
    assert.match(text, /^## Other repositories$/m, name);
    assert.match(text, /\| Findings \| \d+ \|/, name);
  }
});

test("the dogfood label is defined for the label sync", async () => {
  assert.match(await readFile(resolve(".github/labels.yml"), "utf8"), /- name: "dogfood"/);
});
