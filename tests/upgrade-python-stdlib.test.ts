import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import type { RegistryV2Rule } from "../src/registry.js";
import { registryV2Issues } from "../src/registry.js";
import { checkUpgrade } from "../src/upgrade/index.js";
import type { UpgradeIssue, UpgradeReport } from "../src/upgrade/types.js";

const root = join(import.meta.dirname, "..", "..");
const fixture = join(root, "tests", "fixtures", "upgrade", "python-stdlib");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((directory) => rm(directory, { recursive: true, force: true })));
});

function issue(overrides: Partial<UpgradeIssue>): UpgradeIssue {
  return {
    analyzer: "python-stdlib",
    level: "blocker",
    subject: "subject",
    path: "app.py",
    line: 1,
    reason: "reason",
    evidence: { kind: "rule", value: "python.module.subject.removed" },
    ...overrides,
  };
}

async function report(version: string): Promise<UpgradeReport> {
  return checkUpgrade(fixture, { runtime: "python", version });
}

const removeIn312 = ["distutils", "asynchat", "asyncore", "smtpd", "imp"];
const removeIn313 = [
  "aifc",
  "audioop",
  "cgi",
  "cgitb",
  "chunk",
  "crypt",
  "imghdr",
  "mailcap",
  "msilib",
  "nis",
  "nntplib",
  "ossaudiodev",
  "pipes",
  "sndhdr",
  "spwd",
  "sunau",
  "telnetlib",
  "uu",
  "xdrlib",
  "lib2to3",
];

test("a module import removed by the target is a blocker at its exact location", async () => {
  const result = await report("3.13");
  assert.equal(result.verdict, "blocked");
  assert.deepEqual(result.analyzers, ["python-stdlib"]);
  assert.equal(result.issues[0]?.path, "app.py");
  assert.deepEqual(
    result.issues[0],
    issue({
      subject: "cgi",
      line: 3,
      reason: "Python 3.13 removed the cgi module (PEP 594), so importing it raises ModuleNotFoundError.",
      evidence: { kind: "rule", value: "python.module.cgi.removed" },
    }),
  );
});

test("from x import y is reported for a removed module, and a deprecated symbol is a warning", async () => {
  const result = await report("3.13");
  assert.deepEqual(
    result.issues.map((entry) => [entry.level, entry.subject, entry.line, entry.evidence.value]),
    [
      ["blocker", "cgi", 3, "python.module.cgi.removed"],
      ["blocker", "telnetlib", 4, "python.module.telnetlib.removed"],
      ["blocker", "lib2to3", 17, "python.module.lib2to3.removed"],
      ["warning", "datetime.datetime.utcnow", 13, "python.symbol.datetime.utcnow"],
    ],
  );
});

test("a module removed after the target is not reported", async () => {
  const result = await report("3.12");
  assert.equal(result.verdict, "ready");
  assert.deepEqual(
    result.issues.map((entry) => [entry.level, entry.subject, entry.line]),
    [["warning", "datetime.datetime.utcnow", 13]],
  );
});

test("the analyzer does not apply to a repository without Python source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-upgrade-python-"));
  temporaryRoots.push(directory);
  await writeFile(join(directory, "package.json"), '{"name":"fixture"}');
  const result = await checkUpgrade(directory, { runtime: "python", version: "3.13" });
  assert.deepEqual(result, {
    schemaVersion: "evergreen.upgrade.v1",
    target: { runtime: "python", version: "3.13" },
    verdict: "unknown",
    analyzers: [],
    issues: [],
  });
});

test("every removed standard-library module has a sourced removal rule and a module import matcher", async () => {
  const registry = JSON.parse(await readFile(join(root, "registry", "python.json"), "utf8")) as {
    rules: RegistryV2Rule[];
  };
  assert.deepEqual(registryV2Issues(registry), []);
  const rules = new Map(
    registry.rules.filter((rule) => rule.id.startsWith("python.module.")).map((rule) => [rule.id, rule]),
  );
  assert.equal(rules.size, removeIn312.length + removeIn313.length);
  for (const module of [...removeIn312, ...removeIn313]) {
    const rule = rules.get(`python.module.${module}.removed`);
    assert.ok(rule, `${module} has a removal rule`);
    assert.equal(rule.event, "removed");
    assert.equal(rule.vers, `vers:pypi/>=${removeIn312.includes(module) ? "3.12" : "3.13"}`);
    assert.deepEqual(rule.usage, [{ kind: "import", language: "python", module }]);
    assert.ok(rule.sources.length > 0 && rule.sources.every((source) => source.url.startsWith("https://")));
    if (!["distutils", "imp", "lib2to3"].includes(module)) {
      assert.ok(
        rule.sources.some((source) => source.url === "https://peps.python.org/pep-0594/"),
        `${module} cites PEP 594`,
      );
    }
  }
});
