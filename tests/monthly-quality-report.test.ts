import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const directory = resolve("docs/reports");

test("the first monthly progress report is published with every quality target", async () => {
  const reports = (await readdir(directory)).filter((name) => name.startsWith("monthly-") && name.endsWith(".md"));
  assert.ok(reports.length > 0, "the first monthly report is published");
  for (const name of reports) {
    assert.match(name, /^monthly-\d{4}-(0[1-9]|1[0-2])\.md$/, name);
    const text = await readFile(resolve(directory, name), "utf8");
    assert.match(text, /^# Evergreen Monthly Progress Report: \d{4}-\d{2}$/m, name);
    assert.match(text, /^## Reference quality$/m, name);
    assert.match(text, /\| Criterion \| Target \| Current \| Change vs last month \|/, name);
    for (const criterion of [
      "File size",
      "Complexity",
      "Type safety",
      "Boundaries",
      "Coverage",
      "Mutation score",
      "Docs",
      "Security",
      "Remaining debt",
    ]) {
      assert.match(text, new RegExp(`\\| ${criterion} \\|`), name);
    }
    assert.match(text, /docs\/QUALITY\.md/, name);
  }
});
