import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { declaresInput } from "../src/detector-inputs.js";
import { PythonDetector } from "../src/detectors/python.js";

async function scan(t: TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(join(root, path), text)));
  const detector = new PythonDetector();
  for (const path of Object.keys(files)) assert.ok(declaresInput(detector.inputs, path), path);
  return detector.scan({ root });
}

for (const [path, contents, line, severity] of [
  [".python-version", "3.9.25\n", 1, "high"],
  ["pyproject.toml", '[project]\nname = "app"\nrequires-python = ">=3.9,<4"\n', 3, "medium"],
  ["setup.cfg", "[metadata]\nname = app\n[options]\npython_requires = >=3.9,<4\n", 4, "medium"],
  ["setup.cfg", "[options]\npython_requires =\n    >=3.9,<4\n", 3, "medium"],
  ["setup.py", 'from setuptools import setup\nsetup(name="app", python_requires=">=3.9,<4")\n', 2, "medium"],
  ["setup.py", 'import setuptools\nsetuptools.setup(\n    python_requires=">=3.9,<4",\n)\n', 3, "medium"],
  ["tox.ini", "[tox]\nenvlist = py39\n", 2, "high"],
] as const) {
  test(`reports an end-of-life interpreter in ${path} at line ${line} (${contents.trim()})`, async (t) => {
    const findings = await scan(t, { [path]: contents });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "python.runtime.eol-3.9-and-older");
    assert.deepEqual(findings[0]?.location, { path, line });
    assert.equal(findings[0]?.severity, severity);
    assert.ok(findings[0]?.sources.length);
  });
}

test("reads each .python-version pin at its own line and skips comments and floating values", async (t) => {
  const findings = await scan(t, {
    ".python-version": "# Python 3.8 is old\n\n3.12.1\n3.9.25 # legacy\n3.10.14\nsystem\n3\n",
  });
  assert.deepEqual(findings.map((f) => [f.location.line, f.ruleId]), [
    [4, "python.runtime.eol-3.9-and-older"],
    [5, "python.runtime.eol-3.10-and-older"],
  ]);
});

test("reads multiline tox envlists, factors, and Python brace lists at their exact lines", async (t) => {
  const findings = await scan(t, {
    "tox.ini": "[tox]\nenvlist =\n    py{39,310}-unit, py312\n    lint-py38, docs, pypy39, py3\n[testenv]\nenvlist = py27\n",
  });
  assert.deepEqual(findings.map((f) => [f.location.line, f.summary.match(/includes Python (\d+\.\d+)/)?.[1]]), [
    [3, "3.9"], [3, "3.10"], [4, "3.8"],
  ]);
  assert.equal(new Set(findings.map((f) => f.id)).size, findings.length);
});

test("recognizes tox env_list and skips comments and substitutions", async (t) => {
  const findings = await scan(t, {
    "tox.ini": "[tox]\n# envlist = py27\nenv_list = py39-unit, py39-integration, py312 # py27\n    {env:EXTRA:py38}\n",
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.location.line, 3);
});

for (const range of ["<3.9", "<=3.9", "< 3.9", "!= 3.9.*", "!=3.9.*", "<3.9,!=3.8.*", "*", ">=3.12", ">=3.8,>=3.12"]) {
  test(`does not guess an unsupported interpreter from ${range}`, async (t) => {
    assert.deepEqual(await scan(t, {
      "pyproject.toml": `[project]\nrequires-python = "${range}"\n`,
      "setup.cfg": `[options]\npython_requires = ${range}\n`,
      "setup.py": `from setuptools import setup\nsetup(python_requires="${range}")\n`,
    }), []);
  });
}

for (const range of ["==3.9.*", "~=3.9.0", ">=3.9, <3.12"]) {
  test(`keeps a concrete lower bound in ${range}`, async (t) => {
    const findings = await scan(t, { "pyproject.toml": `[project]\nrequires-python = "${range}"\n` });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "python.runtime.eol-3.9-and-older");
  });
}

test("ignores unrelated INI sections and dynamic or commented setup.py declarations", async (t) => {
  assert.deepEqual(await scan(t, {
    "setup.cfg": "# python_requires = >=3.8\n[metadata]\npython_requires = >=3.8\n[options]\npython_requires = >=3.12\n",
    "setup.py": `from setuptools import setup
# setup(python_requires=">=3.8")
text = 'setup(python_requires=">=3.8")'
setup(python_requires=get_version())
setup(python_requires=">=3.8" + suffix)
setup(python_requires=f">=3.8{suffix}")
other(python_requires=">=3.8")
`,
    "tox.ini": "[testenv]\nenvlist = py38\n[other]\nenvlist = py39\n",
  }), []);
});

test("reports every declaration when all four runtime sources coexist", async (t) => {
  const findings = await scan(t, {
    ".python-version": "3.9.25\n",
    "pyproject.toml": '[project]\nrequires-python = ">=3.9"\n',
    "setup.cfg": "[options]\npython_requires = >=3.9\n",
    "tox.ini": "[tox]\nenvlist = py39\n",
  });
  assert.deepEqual(findings.map((f) => f.location.path).sort(), [".python-version", "pyproject.toml", "setup.cfg", "tox.ini"]);
});
