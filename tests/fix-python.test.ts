import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";

import { PythonDetector } from "../src/detectors/python.js";
import { scanRepository } from "../src/engine.js";
import { planFixes, pythonFixer, renderPatches } from "../src/fix/index.js";

const execute = promisify(execFile);
const scan = async (root: string) => ({ ...await scanRepository(root, [new PythonDetector()]), asOf: "2026-10-28" });

async function repository(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-python-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.autocrlf", "false"], { cwd: root });
  return root;
}

test("fixes both Python declarations minimally, applies cleanly, and is idempotent", async (t) => {
  const before = `[project]
name = "app"
requires-python = ">=3.9, <4" # keep the upper bound
classifiers = ["Programming Language :: Python :: 3.9"]
[tool.example]
requires-python = ">=3.8"
`;
  const root = await repository(t, { ".python-version": "3.9.18\n", "pyproject.toml": before });
  const patches = await planFixes(await scan(root));
  assert.deepEqual(patches.map((patch) => patch.path), [".python-version", "pyproject.toml"]);
  assert.equal(await readFile(join(root, "pyproject.toml"), "utf8"), before);
  const path = join(root, "fix.patch");
  await writeFile(path, renderPatches(patches));
  await execute("git", ["apply", "--check", path], { cwd: root });
  await execute("git", ["apply", path], { cwd: root });
  assert.equal(await readFile(join(root, ".python-version"), "utf8"), "3.11\n");
  assert.equal(await readFile(join(root, "pyproject.toml"), "utf8"), before.replace(">=3.9", ">=3.11"));
  assert.deepEqual(await planFixes(await scan(root)), []);
});

for (const range of [">=3.8", " <4, >= 3.9.2 ", ">=3.8,>=3.9,<=3.12"]) {
  test(`raises explicit lower bounds in ${range}, preserving quotes and CRLF`, async (t) => {
    const root = await repository(t, { "pyproject.toml": `[project]\r\nrequires-python = '${range}' # keep\r\n` });
    const patches = await pythonFixer.plan(await scan(root));
    assert.equal(patches.length, 1);
    const path = join(root, "fix.patch");
    await writeFile(path, renderPatches(patches));
    await execute("git", ["apply", path], { cwd: root });
    assert.equal(await readFile(join(root, "pyproject.toml"), "utf8"),
      `[project]\r\nrequires-python = '${range.replace(/3\.(?:8|9)(?:\.2)?/g, "3.11")}' # keep\r\n`);
  });
}

for (const range of [">=3.12", ">=3.9,<3.11", ">=3.9,<=3.10", "==3.9.*", "~=3.9.0", ">=3.9,!=3.11.*", "<4"]) {
  test(`leaves supported, contradictory, or ambiguous constraints alone: ${range}`, async (t) => {
    const root = await repository(t, { "pyproject.toml": `[project]\nrequires-python = "${range}"\n` });
    assert.deepEqual(await pythonFixer.plan(await scan(root)), []);
  });
}

test("does not rewrite Poetry constraints, multiline strings, or files without a final newline", async (t) => {
  for (const contents of [
    '[tool.poetry.dependencies]\npython = ">=3.9"\n',
    '[project]\nrequires-python = """>=3.9"""\n',
    '[project]\nrequires-python = ">=3.9"',
    '[project]\ndescription = \'\'\'\nrequires-python = ">=3.9"\n\'\'\'\nrequires-python = ">=3.9"\n',
  ]) {
    const root = await repository(t, { "pyproject.toml": contents });
    assert.deepEqual(await pythonFixer.plan(await scan(root)), []);
  }
});

test("uses the scan date when choosing the oldest supported minor", async (t) => {
  const root = await repository(t, { "pyproject.toml": '[project]\nrequires-python = ">=3.8"\n' });
  const result = await scan(root);
  const patches = await pythonFixer.plan({ ...result, asOf: "2026-01-01" });
  assert.match(patches[0]!.diff, /\+requires-python = ">=3.10"/);
});

test("declines paths outside the repository", async (t) => {
  const root = await repository(t, { "pyproject.toml": '[project]\nrequires-python = ">=3.9"\n' });
  const result = await scan(root);
  const finding = result.findings[0]!;
  assert.deepEqual(await pythonFixer.plan({ ...result, findings: [{ ...finding, location: { path: "../pyproject.toml", line: 2 } }] }), []);
});
