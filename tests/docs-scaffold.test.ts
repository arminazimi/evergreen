import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { BUNDLED_ECOSYSTEMS } from "../src/data-bundle.js";
import { renderScaffold, scaffoldNames } from "../tools/scaffold/index.js";

const read = (path: string) => readFile(resolve(path), "utf8");
const detectors = await read("docs/DETECTORS.md");
const section = detectors.slice(detectors.indexOf("## Start a new detector in this repository"), detectors.indexOf("## Unclassified references"));

test("the guide lists exactly the files the generator creates", () => {
  assert.ok(section.length > 500);
  const documented = [...section.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]!.replace(/<id>/g, "x"));
  const generated = [...renderScaffold(scaffoldNames("x")).keys()].map((path) => path.replace("tests/fixtures/x/README.md", "tests/fixtures/x/").replace(/tests\/fixtures\/x\/(zero|malformed)\/README\.md/, ""));
  assert.deepEqual([...documented].sort(), [...new Set(generated.filter(Boolean))].sort());
  assert.match(section, /creates nine files/);
  assert.equal(renderScaffold(scaffoldNames("x")).size, 9);
});

test("the commands in the guide and in CONTRIBUTING.md exist", async () => {
  const cli = await read("src/cli-main.ts");
  assert.ok(cli.includes("new-detector"));
  for (const text of ["node dist/src/cli.js new-detector go-modules --ecosystem go", "npm run validate:public-repos", "npm run check"]) assert.ok(section.includes(text), text);
  const contributing = await read("CONTRIBUTING.md");
  assert.ok(contributing.includes("node dist/src/cli.js new-detector <id> [--ecosystem <slug>]"));
  assert.ok(contributing.includes("docs/DETECTORS.md#start-a-new-detector-in-this-repository"));
  assert.ok(contributing.includes("(#add-a-new-detector)"));
  assert.match(contributing, /^## Add a new detector$/m);
});

test("the manual registration steps name files and constants that exist", async () => {
  await access(resolve("src/detectors/index.ts"));
  assert.ok((await read("src/detectors/index.ts")).includes("builtInDetectors"));
  assert.ok((await read("src/data-bundle.ts")).includes("BUNDLED_ECOSYSTEMS"));
  assert.ok(BUNDLED_ECOSYSTEMS.length >= 4);
  await access(resolve("benchmarks/thresholds.json"));
  assert.ok((await read("docs/VALIDATION.md")).includes("## Precision thresholds"), "the guide links to this section");
  assert.ok((await read("tools/scaffold/index.ts")).includes("BUNDLED_ECOSYSTEMS in src/data-bundle.ts"), "the generator tells the same story");
});

test("every relative link in the new section resolves", async () => {
  for (const link of new Set([...section.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!))) {
    await access(resolve("docs", link));
  }
});
