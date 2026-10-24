import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { PythonDetector, staysOnScheduledLine } from "../src/detectors/python.js";
import { versContains } from "../src/vers/index.js";

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

test("reports a Django release series that is end-of-life when a requirements file pins it", async () => {
  const root = await repository({
    "requirements.txt": "Django==3.2.25\n",
    "app.py": "import django\n",
  });

  const findings = await new PythonDetector().scan({ root });

  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding?.ruleId, "python.package.django-3.2.eol");
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.deadline, "2024-04-01");
  assert.equal(finding?.location.path, "requirements.txt");
  assert.equal(finding?.location.line, 1);
  assert.ok(finding?.summary.includes("resolved: 3.2.25"));
  assert.equal(finding?.impact?.usageCount, 1);
});

test("reports a Django pin in pyproject.toml and the version a lockfile resolves", async () => {
  const pinned = await repository({
    "pyproject.toml": `[project]\nname = "legacy-app"\ndependencies = ["Django==4.2.30"]\n`,
  });
  const pinnedFindings = await new PythonDetector().scan({ root: pinned });
  assert.deepEqual(
    pinnedFindings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [["python.package.django-4.2.eol", "pyproject.toml", 3]],
  );

  const locked = await repository({
    "pyproject.toml": `[project]\nname = "legacy-app"\ndependencies = ["Django>=4.1"]\n`,
    "uv.lock": `version = 1\n[[package]]\nname = "django"\nversion = "4.1.13"\n`,
  });
  const lockedFindings = await new PythonDetector().scan({ root: locked });
  assert.equal(lockedFindings.length, 1);
  assert.equal(lockedFindings[0]?.ruleId, "python.package.django-4.1.eol");
  assert.ok(lockedFindings[0]?.summary.includes("resolved: 4.1.13"));
});

test("a supported Django release produces no finding, and a declared range is not a pin", async () => {
  const supported = await repository({
    "pyproject.toml": `[project]\nname = "modern-app"\ndependencies = ["Django==5.2.18"]\n`,
    "uv.lock": `version = 1\n[[package]]\nname = "django"\nversion = "6.1.2"\n`,
  });
  assert.deepEqual(await new PythonDetector().scan({ root: supported }), []);

  const ranged = await repository({
    "requirements.txt": "Django>=3.2,<4.0\n",
    "app.py": "import django\n",
  });
  assert.deepEqual(await new PythonDetector().scan({ root: ranged }), []);
});

test("a malformed Django version matches no rule and does not stop the scan", async () => {
  const root = await repository({
    "requirements.txt": "Django==not-a-version\nrequests==2.31.0\n",
  });

  assert.deepEqual(await new PythonDetector().scan({ root }), []);
});

test("bundled Django rules cover each end-of-life series once and no supported series", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/python.json"), "utf8")) as {
    rules: Array<{ id: string; purl: string; vers: string; event: string; deadline?: string }>;
  };
  const djangoRules = registry.rules.filter((rule) => rule.purl === "pkg:pypi/django");

  assert.equal(djangoRules.length, 20);
  assert.ok(djangoRules.every((rule) => rule.event === "end-of-life" && rule.deadline !== undefined));

  const releases = ["1.3.7", "1.4.22", "1.11.29", "2.2.28", "3.2.25", "4.2.30", "5.0.14", "5.1.15"];
  for (const release of releases) {
    const matching = djangoRules.filter((rule) => versContains(rule.vers, release));
    assert.deepEqual(matching.map((rule) => rule.id), [`python.package.django-${release.split(".").slice(0, 2).join(".")}.eol`]);
  }
  for (const supported of ["5.2.18", "6.0.9", "6.1.2"]) {
    assert.deepEqual(djangoRules.filter((rule) => versContains(rule.vers, supported)), []);
  }
  // Pre-releases of the next series are not part of the series before it.
  assert.deepEqual(djangoRules.filter((rule) => versContains(rule.vers, "5.0rc1")), []);
});

test("a Django range in optional and dependency-group declarations without a lockfile produces no finding (b-fast shape)", async () => {
  const root = await repository({
    "pyproject.toml": `[project]
name = "bfast-like"
requires-python = ">=3.8"
dependencies = ["pydantic>=2.0"]

[project.optional-dependencies]
django = [
    "django>=4.2",
    "django-ninja>=1.0",
]
all = [
    "django>=4.2",
]

[dependency-groups]
dev = [
    "django>=4.2",
]
`,
  });

  const findings = await new PythonDetector().scan({ root });

  assert.deepEqual(
    findings.filter((finding) => finding.ruleId.startsWith("python.package.django")),
    [],
  );
});

test("a lockfile entry that resolves an end-of-life Django counts when its marker applies (b-fast lock shape)", async () => {
  const root = await repository({
    "pyproject.toml": `[project]
name = "bfast-like"
requires-python = ">=3.8"

[project.optional-dependencies]
django = [
    "django>=4.2",
]
`,
    "uv.lock": `version = 1
[[package]]
name = "django"
version = "4.2.30"
source = { registry = "https://pypi.org/simple" }
resolution-markers = ["python_full_version < '3.10'"]

[[package]]
name = "django"
version = "5.2.17"
source = { registry = "https://pypi.org/simple" }
resolution-markers = ["python_full_version >= '3.10'"]
`,
  });

  const findings = (await new PythonDetector().scan({ root })).filter((finding) => finding.ruleId.startsWith("python.package.django"));

  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [["python.package.django-4.2.eol", "pyproject.toml", 6]],
  );
  assert.ok(findings[0]?.summary.includes("resolved: 4.2.30, 5.2.17"));
});

test("a scheduled Python line is reported only for a declaration that stays on exactly that line", () => {
  const pinned = (value: string) => ({ kind: "pinned runtime", value });
  const range = (value: string) => ({ kind: "compatibility range", value });
  assert.equal(staysOnScheduledLine(pinned("3.11.4"), [3, 11]), true);
  assert.equal(staysOnScheduledLine(pinned("python-3.11"), [3, 11]), true);
  assert.equal(staysOnScheduledLine(range(">=3.11,<3.12"), [3, 11]), true);
  assert.equal(staysOnScheduledLine(range("==3.11.*"), [3, 11]), true);
  // A range that merely allows the line, a different line, or a lower floor is not a problem with the declaration.
  assert.equal(staysOnScheduledLine(range(">=3.11"), [3, 11]), false);
  assert.equal(staysOnScheduledLine(range("~=3.11"), [3, 11]), false);
  assert.equal(staysOnScheduledLine(range(">=3.9,<3.12"), [3, 11]), false);
  assert.equal(staysOnScheduledLine(pinned("3.12"), [3, 11]), false);
  assert.equal(staysOnScheduledLine(pinned("3.10"), [3, 11]), false);
});
