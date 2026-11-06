import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { pythonImpFixer } from "../src/fix/index.js";
import { apply, assertParses, cleanup, normalized, plan as planCodemod, repository } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/python-imp");

after(cleanup);

const plan = (files: Record<string, string>) => planCodemod(files, "python-imp");

const rows = ["reload", "new-module", "get-magic", "get-tag", "cache-from-source", "source-from-cache"];

for (const row of rows) {
  test(`${row} is rewritten exactly, drops import imp, and is idempotent`, async () => {
    const before = await readFile(join(fixtures, row, "before.py"), "utf8");
    const expected = await readFile(join(fixtures, row, "after.py"), "utf8");
    const { root, patches } = await plan({ "app.py": before });

    assert.equal(patches.length, 1);
    const fixed = await apply(root, patches[0]!.diff);
    assert.equal(fixed, normalized(expected));
    assert.doesNotMatch(fixed, /^import imp$/m);
    await assertParses(fixed);

    assert.deepEqual((await plan({ "app.py": expected })).patches, []);
  });
}

test("a file with a rewritable and a refused call keeps import imp and adds the import after it", async () => {
  const before = await readFile(join(fixtures, "mixed", "before.py"), "utf8");
  const expected = await readFile(join(fixtures, "mixed", "after.py"), "utf8");
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  const fixed = await apply(root, patches[0]!.diff);
  assert.equal(fixed, normalized(expected));
  assert.match(fixed, /^import imp\nimport importlib\n/m);
  await assertParses(fixed);

  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /imp\.find_module/);
  assert.equal(refusals[0]!.line, 4);
});

test("each removed function without an exact equivalent is refused", async () => {
  const { patches, refusals } = await plan({
    "app.py": await readFile(join(fixtures, "refusals", "functions.py"), "utf8"),
  });

  assert.deepEqual(patches, []);
  assert.equal(refusals.length, 4);
  for (const symbol of ["find_module", "load_module", "load_source", "get_suffixes"]) {
    assert.ok(
      refusals.some((refusal) => refusal.reason.includes(`imp.${symbol}`)),
      `${symbol} is refused by name`,
    );
  }
});

test("keyword arguments and positional arguments the replacement reads differently are refused", async () => {
  const { patches, refusals } = await plan({
    "app.py": await readFile(join(fixtures, "refusals", "keywords.py"), "utf8"),
  });

  assert.deepEqual(patches, []);
  assert.equal(refusals.length, 4);
  assert.ok(refusals.some((refusal) => refusal.reason.includes("keyword argument `file`")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("takes no arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("second positional argument")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("imp.find_module")));
});

test("from-import, aliased-import, rebinding, and multi-name import shapes are refused", async () => {
  const cases = [
    { file: "from-import.py", reason: /from imp import/ },
    { file: "aliased-import.py", reason: /import imp as/ },
    { file: "rebinding.py", reason: /not a direct `imp\.reload` attribute/ },
    { file: "multiple-import.py", reason: /imports other modules/ },
  ];
  for (const { file, reason } of cases) {
    const { patches, refusals } = await plan({ "app.py": await readFile(join(fixtures, "refusals", file), "utf8") });
    assert.deepEqual(patches, [], `${file} is unchanged`);
    assert.ok(refusals.length > 0, `${file} is refused`);
    assert.ok(
      refusals.some((refusal) => reason.test(refusal.reason)),
      `${file} refusal: ${refusals[0]!.reason}`,
    );
  }
});

test("a keyword argument the replacement accepts is kept", async () => {
  const before = "import imp\n\nmodule = imp.reload(module=existing)\n";
  const expected = "import importlib\n\nmodule = importlib.reload(module=existing)\n";
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
  await assertParses(expected);
});

test("an import the file already has is not added twice", async () => {
  const before = "import importlib\nimport imp\n\nmodule = imp.reload(existing)\n";
  const expected = "import importlib\n\nmodule = importlib.reload(existing)\n";
  const { root, patches } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
});

test("every needed import is added in rule order", async () => {
  const before = "import imp\n\nmodule = imp.reload(existing)\nmagic = imp.get_magic()\n";
  const expected =
    "import importlib\nimport importlib.util\n\nmodule = importlib.reload(existing)\nmagic = importlib.util.MAGIC_NUMBER\n";
  const { root, patches } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
});

test("plan refuses a syntax error, a file without a final newline, a missing file, and a path outside the root", async () => {
  const root = await repository({
    "syntax.py": "import imp\n\ndef broken(:\n    imp.reload(x)\n",
    "no-newline.py": "import imp\n\nmodule = imp.reload(existing)",
  });
  const paths = ["syntax.py", "no-newline.py", "missing.py", "../outside.py"];
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: paths.map((path, index) => ({
      id: `python.symbol.imp.reload:${path}:${index}`,
      ruleId: "python.symbol.imp.reload",
      detector: "python",
      title: "Imp.reload has been removed",
      summary: "",
      severity: "high",
      confidence: "exact",
      location: { path, line: 3, column: 10 },
      sources: [],
      usages: [
        {
          kind: "symbol",
          language: "python",
          symbol: "imp.reload",
          location: { path, line: 3, column: 10 },
          excerpt: "",
        },
      ],
    })),
    diagnostics: [],
  };

  const reasons: string[] = [];
  const patches = await pythonImpFixer.plan(result, (_finding, reason) => reasons.push(reason));
  assert.deepEqual(patches, []);
  assert.ok(reasons.some((reason) => reason.includes("syntax errors")));
  assert.ok(reasons.some((reason) => reason.includes("does not end with a newline")));
  assert.ok(reasons.some((reason) => reason.includes("could not be read")));
  assert.ok(reasons.some((reason) => reason.includes("resolves outside the repository")));
});
