import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  classifyChanges,
  importSpecifiers,
  isTestFile,
  listTypeScriptFiles,
  resolveModuleSpecifier,
  selectAffectedTests,
} from "../tools/run-tests-selection.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-run-tests-selection-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

// A small repository whose imports make the expected test set checkable by hand:
//   tests/a.test.ts -> src/a.ts -> src/b.ts
//   tests/b.test.ts -> src/b.ts
//   tests/c.test.ts -> tests/helper.ts -> src/c.ts
//   tests/isolated.test.ts imports nothing
const GRAPH = {
  "src/a.ts": `import { b } from "./b.js";\nexport const a = b + 1;\n`,
  "src/b.ts": `export const b = 1;\n`,
  "src/c.ts": `export const c = 2;\n`,
  "src/cycle-left.ts": `import { right } from "./cycle-right.js";\nexport const left = right;\n`,
  "src/cycle-right.ts": `import { left } from "./cycle-left.js";\nexport const right = left;\n`,
  "tests/a.test.ts": `import { a } from "../src/a.js";\nexport const value = a;\n`,
  "tests/b.test.ts": `import { b } from "../src/b.js";\nexport const value = b;\n`,
  "tests/c.test.ts": `import "./helper.js";\n`,
  "tests/helper.ts": `import { c } from "../src/c.js";\nexport const helper = c;\n`,
  "tests/cycle.test.ts": `import { left } from "../src/cycle-left.js";\nexport const value = left;\n`,
  "tests/isolated.test.ts": `export const value = 0;\n`,
};

test("importSpecifiers collects import, re-export, dynamic import, and require specifiers", () => {
  const source = `
import a from "./a.js";
export { b } from "./b.js";
import c = require("./c.js");
const d = await import("./d.js");
const e = require("./e.js");
const notImport = 'from "./not-an-import.js"';
// from "./also-not-an-import.js"
`;
  assert.deepEqual(importSpecifiers(source).sort(), ["./a.js", "./b.js", "./c.js", "./d.js", "./e.js"]);
});

test("resolveModuleSpecifier maps compiled specifiers back to sources and index files", () => {
  const exists = (path: string) => ["src/a.ts", "src/index.ts", "tests/helper.ts"].includes(path);
  assert.equal(resolveModuleSpecifier("tests/x.test.ts", "../src/a.js", exists), "src/a.ts");
  assert.equal(resolveModuleSpecifier("tests/x.test.ts", "./helper.js", exists), "tests/helper.ts");
  assert.equal(resolveModuleSpecifier("src/x.ts", ".", exists), "src/index.ts");
  assert.equal(resolveModuleSpecifier("src/x.ts", "typescript", exists), undefined);
  assert.equal(resolveModuleSpecifier("src/x.ts", "../../outside.js", exists), undefined);
});

test("classifyChanges runs tests, places modules, and ignores documentation", () => {
  assert.deepEqual(classifyChanges(["tests/a.test.ts", "src/b.ts", "docs/page.md", "README.md"]), {
    modules: ["src/b.ts"],
    tests: ["tests/a.test.ts"],
  });
});

test("shared paths, configuration, and unknown root files run the full suite", () => {
  for (const path of [
    "registry/npm.json",
    "package.json",
    "tools/run-tests.mjs",
    "tests/fixtures/npm/positive/package.json",
    ".github/workflows/ci.yml",
    "benchmarks/test-file-timings.json",
  ]) {
    assert.match(classifyChanges([path]).fullRunReason ?? "", /shared path/, path);
  }
  assert.match(classifyChanges(["LICENSE"]).fullRunReason ?? "", /outside src\/ and tests\//);
});

test("a source module selects every test that reaches it through imports and helpers", async () => {
  const root = await tree(GRAPH);
  const selection = await selectAffectedTests(["src/b.ts"], { root });
  assert.equal(selection.full, false);
  assert.deepEqual(selection.tests, ["tests/a.test.ts", "tests/b.test.ts"]);

  const throughHelper = await selectAffectedTests(["src/c.ts"], { root });
  assert.deepEqual(throughHelper.tests, ["tests/c.test.ts"]);
  assert.match(throughHelper.reason, /only 1 of 5 test files/);

  const testOnly = await selectAffectedTests(["tests/isolated.test.ts"], { root });
  assert.deepEqual(testOnly.tests, ["tests/isolated.test.ts"]);
});

test("a cycle in the import graph terminates and still names the test", async () => {
  const root = await tree(GRAPH);
  const selection = await selectAffectedTests(["src/cycle-right.ts"], { root });
  assert.equal(selection.full, false);
  assert.deepEqual(selection.tests, ["tests/cycle.test.ts"]);
});

test("a module no test imports, or a deleted one, runs the full suite", async () => {
  const root = await tree({ ...GRAPH, "src/orphan.ts": "export const orphan = 1;\n" });
  const orphan = await selectAffectedTests(["src/orphan.ts"], { root });
  assert.equal(orphan.full, true);
  assert.match(orphan.reason, /no test imports src\/orphan\.ts/);

  const deleted = await selectAffectedTests(["src/gone.ts"], { root });
  assert.equal(deleted.full, true);
  assert.match(deleted.reason, /no test imports src\/gone\.ts/);
});

test("documentation changes select no tests and no full run", async () => {
  const root = await tree(GRAPH);
  const selection = await selectAffectedTests(["docs/reference.md"], { root });
  assert.deepEqual(selection, { tests: [], full: false, reason: "no test imports the changed files; nothing to run" });
});

test("an empty change list is not trusted and runs the full suite", async () => {
  const selection = await selectAffectedTests([]);
  assert.equal(selection.full, true);
  assert.match(selection.reason, /change list is empty/);
});

test("the real map narrows a detector change without losing that detector's test", async () => {
  const moduleFiles = await listTypeScriptFiles(".");
  const allTests = moduleFiles.filter(isTestFile);
  const selection = await selectAffectedTests(["src/detectors/npm/index.ts"], { moduleFiles, testFiles: allTests });
  assert.equal(selection.full, false);
  assert.ok(selection.tests.includes("tests/npm.test.ts"));
  assert.ok(selection.tests.length > 0);
  assert.ok(selection.tests.length < allTests.length, "a single module must not select the whole suite");
});
