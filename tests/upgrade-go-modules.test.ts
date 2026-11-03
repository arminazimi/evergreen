import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { checkUpgrade } from "../src/upgrade/index.js";
import {
  compareGoVersions,
  goModulesAnalyzer,
  normalizeGoVersion,
  parseVendorModules,
} from "../src/upgrade/go-modules.js";
import type { UpgradeIssue } from "../src/upgrade/types.js";
import { runCli } from "./cli-runner.js";

const fixtures = resolve("tests/fixtures/upgrade/go-modules");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function rule(id: string): Promise<RegistryV2Rule> {
  const { rules } = validateRegistryV2(JSON.parse(await readFile("registry/go.json", "utf8")) as object);
  const found = rules.find((item) => item.id === id);
  assert.ok(found, `${id} must exist in registry/go.json`);
  return found;
}

async function lifecycle(id: string, path: string, line: number, target: string): Promise<UpgradeIssue> {
  const found = await rule(id);
  return {
    analyzer: "go-modules",
    level: "warning",
    subject: `go@${target}`,
    path,
    line,
    reason: `${found.title}. ${found.summary}`,
    evidence: { kind: "rule", value: id },
  };
}

async function cli(...args: string[]) {
  return runCli(args);
}

test("normalizes and orders Go release numbers", () => {
  assert.equal(normalizeGoVersion("1.22"), "1.22.0");
  assert.equal(normalizeGoVersion("go1.23.4"), "1.23.4");
  assert.equal(normalizeGoVersion("1.24.0"), "1.24.0");
  assert.equal(normalizeGoVersion("nightly"), undefined);
  assert.equal(normalizeGoVersion("1"), undefined);
  assert.ok(compareGoVersions("1.21.9", "1.22.0") < 0);
  assert.equal(compareGoVersions("1.23", "1.23.0"), 0);
  assert.ok(compareGoVersions("1.24.1", "1.23.9") > 0);
});

test("parses each module header with its go annotation and line", () => {
  const modules = parseVendorModules(
    ["# example.com/a v1.0.0", "## explicit; go 1.21", "example.com/a", "# example.com/b v2.0.0", "## go 1.22", "example.com/b"].join("\n"),
  );
  assert.deepEqual(modules, [
    { module: "example.com/a", version: "v1.0.0", go: { value: "1.21", line: 2, text: "## explicit; go 1.21" } },
    { module: "example.com/b", version: "v2.0.0", go: { value: "1.22", line: 5, text: "## go 1.22" } },
  ]);
});

test("a target below the go directive is a manifest blocker", async () => {
  const root = join(fixtures, "below-directive");
  const report = await checkUpgrade(root, { runtime: "go", version: "1.22" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["go-modules"]);
  assert.deepEqual(report.issues, [
    {
      analyzer: "go-modules",
      level: "blocker",
      subject: "go@1.23",
      path: "go.mod",
      line: 3,
      reason: "The target Go 1.22 is below the minimum Go 1.23 declared by go.mod.",
      evidence: { kind: "manifest", value: "1.23" },
    },
    await lifecycle("go.runtime.end-of-support-1.22", "go.mod", 3, "1.22"),
  ]);
});

test("a target below a vendored module's go version is a lockfile blocker", async () => {
  const report = await checkUpgrade(join(fixtures, "below-vendored"), { runtime: "go", version: "1.22" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "go-modules",
      level: "blocker",
      subject: "example.com/lib@v1.4.0",
      path: "vendor/modules.txt",
      line: 2,
      reason: "The target Go 1.22 is below Go 1.23, which example.com/lib@v1.4.0 declares in vendor/modules.txt.",
      evidence: { kind: "lockfile", value: "## explicit; go 1.23" },
    },
    await lifecycle("go.runtime.end-of-support-1.22", "go.mod", 3, "1.22"),
  ]);
});

test("without vendor evidence the dependencies are reported unknown, never assumed compatible", async () => {
  const report = await checkUpgrade(join(fixtures, "no-vendor"), { runtime: "go", version: "1.26" });
  assert.deepEqual(report.issues, [
    {
      analyzer: "go-modules",
      level: "unknown",
      subject: "dependencies",
      path: "vendor/modules.txt",
      reason: "Dependencies' Go requirements are not recorded in the repository without vendoring.",
      evidence: { kind: "lockfile", value: "vendor/modules.txt is absent" },
    },
  ]);
});

test("an end-of-life target is a warning from the bundled Go rule", async () => {
  const report = await checkUpgrade(join(fixtures, "end-of-life"), { runtime: "go", version: "1.23" });
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.issues, [await lifecycle("go.runtime.end-of-support-1.23", "go.mod", 3, "1.23")]);
});

test("a supported target with compatible directives and vendored modules is ready", async () => {
  const report = await checkUpgrade(join(fixtures, "ready"), { runtime: "go", version: "1.26" });
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.issues, []);
});

test("the workspace's go directive is also a minimum", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-go-"));
  temporaryRoots.push(root);
  const files: Record<string, string> = {
    "go.mod": "module example.com/app\n\ngo 1.22\n",
    "go.work": "go 1.24\n\nuse ./app\n",
    "vendor/modules.txt": "# example.com/lib v1.4.0\n## explicit; go 1.22\nexample.com/lib\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const issues = await goModulesAnalyzer.analyze(root, { runtime: "go", version: "1.23" });
  assert.deepEqual(issues[0], {
    analyzer: "go-modules",
    level: "blocker",
    subject: "go@1.24",
    path: "go.work",
    line: 1,
    reason: "The target Go 1.23 is below the minimum Go 1.24 declared by go.work.",
    evidence: { kind: "manifest", value: "1.24" },
  });
  assert.deepEqual(issues[1], await lifecycle("go.runtime.end-of-support-1.23", "go.mod", 3, "1.23"));
});

test("a repository without go.mod is not applicable", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-go-"));
  temporaryRoots.push(root);
  assert.equal(await goModulesAnalyzer.applies(root), false);
  assert.deepEqual(await goModulesAnalyzer.analyze(root, { runtime: "go", version: "1.23" }), []);
});

test("the CLI exits 1 for a blocker, 0 otherwise, and prints the exact evidence", async () => {
  const blocked = await cli("upgrade-check", "--to", "go@1.22", join(fixtures, "below-vendored"));
  assert.equal(blocked.code, 1);
  assert.match(blocked.stdout, /^go@1\.22: blocked/);
  assert.match(
    blocked.stdout,
    /vendor\/modules\.txt:2 {2}example\.com\/lib@v1\.4\.0 {2}The target Go 1\.22 is below Go 1\.23, which example\.com\/lib@v1\.4\.0 declares in vendor\/modules\.txt\. {2}\[lockfile: ## explicit; go 1\.23\]/,
  );

  assert.equal((await cli("upgrade-check", "--to", "go@1.26", join(fixtures, "ready"))).code, 0);
  const unknown = await cli("upgrade-check", "--to", "go@1.26", join(fixtures, "no-vendor"));
  assert.equal(unknown.code, 0);
  assert.match(unknown.stdout, /Dependencies' Go requirements are not recorded in the repository without vendoring\./);
});

test("the blocked report is valid evergreen.upgrade.v1 JSON", async () => {
  const result = await cli("upgrade-check", "--to", "go@1.22", join(fixtures, "below-directive"), "--json");
  assert.equal(result.code, 1);
  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const report = JSON.parse(result.stdout) as { verdict: string; issues: unknown[] };
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.verdict, "blocked");
  assert.equal(report.issues.length, 2);
});
