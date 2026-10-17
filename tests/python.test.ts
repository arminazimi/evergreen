import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { PythonDetector } from "../src/detectors/python.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-"));
  temporaryRoots.push(root);
  await Promise.all(
    Object.entries(files).map(([path, contents]) => writeFile(join(root, path), contents)),
  );
  return root;
}

test("reads PEP 621 metadata and resolves packages from common TOML lockfiles", async () => {
  const root = await repository({
    "pyproject.toml": `[project]
name = "legacy-app"
requires-python = ">=3.9"
dependencies = [
  "nose==1.3.7",
  "pycrypto>=2.6.1",
]

[project.optional-dependencies]
test = ["django_nose>=1.4"]
`,
    "uv.lock": `version = 1
[[package]]
name = "nose"
version = "1.3.7"
`,
    "poetry.lock": `[[package]]
name = "pycrypto"
version = "2.6.1"
`,
    "pdm.lock": `[[package]]
name = "django-nose"
version = "1.4.7"
`,
    "app.py": `import nose\nnose.run()\nfrom Crypto.Cipher import AES\n`,
    "settings.py": `TEST_RUNNER = "django_nose.NoseTestSuiteRunner"\n`,
  });

  const findings = await new PythonDetector().scan({ root });

  assert.equal(findings.length, 4);
  assert.ok(findings.some((finding) => finding.summary.includes("Python 3.9")));
  assert.ok(findings.some((finding) => finding.summary.includes("resolved: 1.3.7")));
  assert.ok(findings.some((finding) => finding.summary.includes("resolved: 2.6.1")));
  assert.ok(findings.some((finding) => finding.summary.includes("resolved: 1.4.7")));
  assert.equal(
    findings.find((finding) => finding.ruleId.includes("package.nose"))?.impact?.usageCount,
    2,
  );
  assert.equal(
    findings.find((finding) => finding.ruleId.includes("pycrypto"))?.impact?.usageCount,
    1,
  );
  assert.equal(
    findings.find((finding) => finding.ruleId.includes("django-nose"))?.impact?.usageCount,
    1,
  );
});

test("reads requirements files, pinned runtimes, and Pipfile.lock", async () => {
  const root = await repository({
    "requirements.txt": "nose==1.3.7\n",
    "requirements-dev.txt": "pycrypto>=2.6\n",
    ".python-version": "3.8.20\n",
    "Pipfile.lock": JSON.stringify({
      default: { nose: { version: "==1.3.7" } },
      develop: { pycrypto: { version: "==2.6.1" } },
    }),
  });

  const findings = await new PythonDetector().scan({ root });

  assert.equal(findings.length, 3);
  assert.ok(findings.some((finding) => finding.severity === "critical"));
  const runtime = findings.find((finding) => finding.ruleId.includes("runtime"));
  assert.equal(runtime?.severity, "high");
  assert.equal(runtime?.location.path, ".python-version");
});

test("reads Poetry dependency tables and tool-version runtime pins", async () => {
  const root = await repository({
    "pyproject.toml": `[tool.poetry]
name = "legacy-app"

[tool.poetry.dependencies]
python = "^3.8"
django-nose = "^1.4"

[tool.poetry.group.dev.dependencies]
nose = "1.3.7"
`,
    ".tool-versions": "nodejs 22.20.0\npython 3.9.25\n",
  });

  const findings = await new PythonDetector().scan({ root });

  assert.equal(findings.length, 4);
  assert.equal(findings.filter((finding) => finding.ruleId.includes("runtime")).length, 2);
  assert.ok(findings.some((finding) => finding.location.path === ".tool-versions"));
});

test("ignores supported runtimes, similarly named packages, and transitive-only locks", async () => {
  const root = await repository({
    "pyproject.toml": `[project]
name = "modern-app"
requires-python = ">=3.11"
dependencies = ["nose2>=0.16", "cryptography>=46"]
`,
    "requirements.txt": "-r requirements-prod.txt\nhttps://example.com/archive.whl\n",
    "uv.lock": `version = 1
[[package]]
name = "nose"
version = "1.3.7"
[[package]]
name = "pycrypto"
version = "2.6.1"
`,
  });

  const findings = await new PythonDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("returns no findings when Python manifests are absent", async () => {
  const root = await repository({ "README.md": "No Python project here.\n" });

  const findings = await new PythonDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("each declaration is reported by the narrowest 'and older' runtime rule that covers it", async () => {
  const root = await repository({
    "pyproject.toml": `[project]\nname = "app"\nrequires-python = ">=3.9"\n`,
    ".python-version": "3.10.14\n",
    "runtime.txt": "python-3.12.1\n",
  });
  const findings = await new PythonDetector().scan({ root });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.path]).sort(),
    [
      ["python.runtime.eol-3.10-and-older", ".python-version"],
      ["python.runtime.eol-3.9-and-older", "pyproject.toml"],
    ],
  );
  assert.equal(findings.find((finding) => finding.location.path === ".python-version")?.deadline, "2026-10-01");
});
