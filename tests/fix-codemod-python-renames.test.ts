import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import type { ScanResult, SymbolUsageMatcher } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { planFixReport, pythonRenamesFixer } from "../src/fix/index.js";
import type { FixerPatch, FixRefusal } from "../src/fix/index.js";
import { analyzePythonFile } from "../src/usage/python.js";
import { parseSource } from "../src/usage/tree-sitter.js";
import { runCli } from "./cli-runner.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/python-renames");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Plan {
  root: string;
  patches: FixerPatch[];
  refusals: FixRefusal[];
}

async function plan(files: Record<string, string>): Promise<Plan> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-renames-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const result = await scanRepository(root, detectors, { noCache: true });
  const report = await planFixReport(result);
  return {
    root,
    patches: report.patches.filter((patch) => patch.fixer === "python-renames"),
    refusals: report.refusals.filter((refusal) => refusal.fixer === "python-renames"),
  };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function apply(root: string, diff: string, file = "app.py"): Promise<string> {
  const patch = join(root, "fix.patch");
  await writeFile(patch, `${diff}\n`);
  await execute("git", ["apply", "--check", patch], { cwd: root });
  await execute("git", ["apply", patch], { cwd: root });
  return normalized(await readFile(join(root, file), "utf8"));
}

async function assertParses(source: string): Promise<void> {
  const tree = await parseSource("python", source);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false);
  tree.delete();
}

for (const row of ["module-renames", "testcase-aliases"]) {
  test(`${row} is rewritten exactly, parses, and is idempotent`, async () => {
    const before = await readFile(join(fixtures, row, "before.py"), "utf8");
    const expected = await readFile(join(fixtures, row, "after.py"), "utf8");
    const { root, patches, refusals } = await plan({ "app.py": before });

    assert.deepEqual(refusals, []);
    assert.equal(patches.length, 1);
    const fixed = await apply(root, patches[0]!.diff);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed);

    assert.deepEqual((await plan({ "app.py": expected })).patches, []);
  });
}

test("a rewritable alias and assertDictContainsSubset in one file produce one patch and one refusal", async () => {
  const before = await readFile(join(fixtures, "mixed", "before.py"), "utf8");
  const expected = await readFile(join(fixtures, "mixed", "after.py"), "utf8");
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  const fixed = await apply(root, patches[0]!.diff);
  assert.equal(fixed, normalized(expected));
  await assertParses(fixed);

  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /no replacement/);
  assert.equal(refusals[0]!.line, 6);
});

test("each refused shape is reported and the file is left unchanged", async () => {
  const cases = [
    { file: "assert-dict-contains-subset.py", refusals: 1, reason: /no replacement/ },
    { file: "non-testcase.py", refusals: 2, reason: /not inside a class that subclasses unittest\.TestCase/ },
    { file: "local-binding.py", refusals: 2, reason: /local binding/ },
    { file: "not-unittest.py", refusals: 0, reason: undefined },
  ];
  for (const { file, refusals: count, reason } of cases) {
    const contents = await readFile(join(fixtures, "refusals", file), "utf8");
    const { root, patches, refusals } = await plan({ "app.py": contents });
    assert.deepEqual(patches, [], `${file} is unchanged`);
    assert.equal(refusals.length, count, `${file} refusal count`);
    if (reason !== undefined) {
      assert.ok(
        refusals.every((refusal) => reason.test(refusal.reason)),
        `${file} refusal: ${refusals[0]?.reason}`,
      );
    }
    assert.equal(await readFile(join(root, "app.py"), "utf8"), contents);
  }
});

const assertEquals: SymbolUsageMatcher = {
  kind: "symbol",
  language: "python",
  module: "unittest",
  symbol: "assertEquals",
  shape: "method",
};

test("the method shape reports an alias call on any receiver inside a TestCase and not outside one", async () => {
  const source = await readFile(join(fixtures, "testcase-aliases", "before.py"), "utf8");
  const inside = await analyzePythonFile({ path: "app.py", language: "python", source }, [
    { id: "rule", matchers: [assertEquals] },
  ]);
  assert.ok(inside);
  const usages = inside.get("rule")!;
  assert.deepEqual(
    usages.map((usage) => usage.location.line),
    [7, 23],
  );
  assert.ok(usages.some((usage) => usage.excerpt.includes("helper")));

  const negative = await readFile(join(fixtures, "refusals", "not-unittest.py"), "utf8");
  const outside = await analyzePythonFile({ path: "app.py", language: "python", source: negative }, [
    { id: "rule", matchers: [assertEquals] },
  ]);
  assert.ok(outside);
  assert.deepEqual(outside.get("rule"), []);

  const plain = await readFile(join(fixtures, "refusals", "non-testcase.py"), "utf8");
  const plainResult = await analyzePythonFile({ path: "app.py", language: "python", source: plain }, [
    { id: "rule", matchers: [assertEquals] },
  ]);
  assert.ok(plainResult);
  assert.deepEqual(plainResult.get("rule"), []);
});

test("fix --json reports the refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-renames-cli-"));
  temporaryRoots.push(root);
  await writeFile(
    join(root, "app.py"),
    await readFile(join(fixtures, "refusals", "assert-dict-contains-subset.py"), "utf8"),
  );

  const { stdout } = await runCli(["fix", root, "--json"]);
  const report = JSON.parse(stdout) as { schemaVersion: string; refusals: FixRefusal[] };
  assert.equal(report.schemaVersion, "evergreen.fix.v1");
  const ours = report.refusals.filter((refusal) => refusal.fixer === "python-renames");
  assert.equal(ours.length, 1);
  assert.equal(ours[0]!.ruleId, "python.symbol.unittest.removed-aliases");
  assert.match(ours[0]!.reason, /no replacement/);
});

test("unittest bindings from an aliased module or an aliased TestCase are followed", async () => {
  const cases = [
    {
      name: "aliased module",
      source:
        "import unittest as ut\n\n\nclass Example(ut.TestCase):\n    def test_one(self):\n        self.assertEquals(a, b)\n",
    },
    {
      name: "aliased TestCase",
      source:
        "from unittest import TestCase as TC\n\n\nclass Example(TC):\n    def test_one(self):\n        self.assertEquals(a, b)\n",
    },
  ];
  for (const { name, source } of cases) {
    const { root, patches, refusals } = await plan({ "app.py": source });
    assert.deepEqual(refusals, [], `${name} is not refused`);
    assert.equal(patches.length, 1, `${name} is rewritten`);
    const fixed = await apply(root, patches[0]!.diff);
    assert.match(fixed, /self\.assertEqual\(a, b\)/, name);
    assert.doesNotMatch(fixed, /assertEquals/, name);
    await assertParses(fixed);
  }
});

test("an alias imported from unittest is not treated as a TestCase base when the class subclasses something else", async () => {
  const source =
    "from unittest import TestCase as TC\n\n\nclass Example(Other):\n    def test_one(self):\n        self.assertEquals(a, b)\n";
  const { patches, refusals } = await plan({ "app.py": source });
  assert.deepEqual(patches, []);
  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /not inside a class that subclasses unittest\.TestCase/);
});

test("targetsFor rewrites a usage a scan finding already carries", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-renames-finding-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "app.py"), "import configparser\n\nparser = configparser.SafeConfigParser()\n");
  const location = { path: "app.py", line: 3, column: 10 };
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: [
      {
        id: "python.symbol.configparser.safeconfigparser:app.py:3:10",
        ruleId: "python.symbol.configparser.safeconfigparser",
        detector: "python",
        title: "Configparser.SafeConfigParser has been removed",
        summary: "",
        severity: "high",
        confidence: "exact",
        location,
        sources: [],
        usages: [
          {
            kind: "symbol",
            language: "python",
            symbol: "configparser.SafeConfigParser",
            location,
            excerpt: "parser = configparser.SafeConfigParser()",
          },
        ],
      },
    ],
    diagnostics: [],
  };

  const patches = await pythonRenamesFixer.plan(result);
  assert.equal(patches.length, 1);
  assert.ok(patches[0]!.diff.includes("+parser = configparser.ConfigParser()"));
});

test("plan refuses a Python file with a syntax error", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-renames-safety-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "app.py"), "import configparser\n\ndef broken(:\n    configparser.SafeConfigParser()\n");
  const location = { path: "app.py", line: 4, column: 5 };
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: [
      {
        id: "python.symbol.configparser.safeconfigparser:app.py:4:5",
        ruleId: "python.symbol.configparser.safeconfigparser",
        detector: "python",
        title: "Configparser.SafeConfigParser has been removed",
        summary: "",
        severity: "high",
        confidence: "exact",
        location,
        sources: [],
        usages: [
          {
            kind: "symbol",
            language: "python",
            symbol: "configparser.SafeConfigParser",
            location,
            excerpt: "",
          },
        ],
      },
    ],
    diagnostics: [],
  };

  const reasons: string[] = [];
  const patches = await pythonRenamesFixer.plan(result, (_finding, reason) => reasons.push(reason));
  assert.deepEqual(patches, []);
  assert.ok(reasons.some((reason) => reason.includes("syntax errors")));
});
