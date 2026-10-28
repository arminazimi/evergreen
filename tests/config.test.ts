import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  applyIgnore,
  ConfigError,
  findConfigFile,
  loadConfig,
  matchesIgnorePattern,
  patternToRegExp,
  validateConfig,
} from "../src/config.js";
import type { ScanResult, Finding } from "../src/domain.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const tempDirs: string[] = [];

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-config-test-"));
  tempDirs.push(dir);
  return dir;
}

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd = process.cwd(), env: NodeJS.ProcessEnv = {}): Promise<Outcome> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

test("JSON Schema: schemas/config.v1.schema.json validates valid configurations and rejects invalid ones", async () => {
  const schemaText = await readFile(resolve("schemas/config.v1.schema.json"), "utf8");
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schema);

  assert.equal(validate({}), true, "empty config should be valid");

  const fullValid = {
    $schema: "https://github.com/arminazimi/evergreen/schemas/config.v1.schema.json",
    schemaVersion: "evergreen.config.v1",
    failOn: "high",
    ignore: ["node_modules/**", "dist/**"],
    dataVersion: "2026.10.01",
    baseline: [".evergreen-baseline.json"],
  };
  assert.equal(validate(fullValid), true, "full camelCase config should be valid");

  const fullKebabValid = {
    "fail-on": "medium",
    "ignore-paths": ["legacy/**"],
    "data-version": "bundled",
    "baseline-files": ["baseline.json"],
  };
  assert.equal(validate(fullKebabValid), true, "full kebab-case config should be valid");

  assert.equal(validate({ failOn: "invalid-severity" }), false, "invalid failOn should be rejected");
  assert.equal(validate({ unknownProperty: 123 }), false, "unknown properties should be rejected");
  assert.equal(validate({ ignore: 123 }), false, "non-array/non-string ignore should be rejected");
  assert.equal(validate({ dataVersion: 123 }), false, "non-string dataVersion should be rejected");
});

test("validateConfig: parses and normalizes configuration options", () => {
  const normalized = validateConfig({
    failOn: "high",
    ignore: ["vendor/**"],
    dataVersion: "2026.10.01",
    baseline: "baseline.json",
  });
  assert.deepEqual(normalized, {
    failOn: "high",
    ignore: ["vendor/**"],
    dataVersion: "2026.10.01",
    baseline: ["baseline.json"],
  });

  const kebabNormalized = validateConfig({
    "fail-on": "medium",
    "ignore-paths": ["fixtures/**"],
    "data-version": "2026.10.15",
    "baseline-files": ["baseline.json"],
  });
  assert.deepEqual(kebabNormalized, {
    failOn: "medium",
    ignore: ["fixtures/**"],
    dataVersion: "2026.10.15",
    baseline: ["baseline.json"],
  });
});

test("validateConfig: rejects unknown keys with a clear ConfigError", () => {
  assert.throws(
    () => validateConfig({ unknownOption: true }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /Unknown key in \.evergreen\.json: "unknownOption"/);
      return true;
    },
  );
});

test("validateConfig: rejects non-object configurations", () => {
  assert.throws(() => validateConfig("string"), /expected a JSON object/);
  assert.throws(() => validateConfig(null), /expected a JSON object/);
  assert.throws(() => validateConfig([1, 2, 3]), /expected a JSON object/);
});

test("validateConfig: rejects invalid field values", () => {
  assert.throws(() => validateConfig({ failOn: "invalid" }), /Invalid severity for fail-on/);
  assert.throws(() => validateConfig({ dataVersion: "" }), /Invalid data-version/);
  assert.throws(() => validateConfig({ ignore: [""] }), /Invalid ignore/);
  assert.throws(() => validateConfig({ baseline: [""] }), /Invalid baseline/);
});

test("patternToRegExp and matchesIgnorePattern: matches paths correctly", () => {
  assert.ok(patternToRegExp("tests/**").test("tests/sub/file.js"));
  assert.ok(patternToRegExp("vendor/").test("vendor/bundle.js"));
  assert.ok(patternToRegExp("*.min.js").test("dist/app.min.js"));
  assert.ok(matchesIgnorePattern(["legacy/**", "temp/"], "legacy/bad.js"));
  assert.ok(matchesIgnorePattern(["legacy/**", "temp/"], "temp/scratch.js"));
  assert.equal(matchesIgnorePattern(["legacy/**"], "src/good.js"), false);
});

test("applyIgnore: filters out matching findings and coverage paths", () => {
  const dummyFinding = (path: string, id: string): Finding => ({
    id,
    ruleId: "dummy-rule",
    detector: "test",
    title: "Dummy finding",
    summary: "A dummy finding for test",
    severity: "high",
    confidence: "exact",
    location: { path, line: 1 },
    sources: [],
  });

  const scanResult: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root: "/repo",
    scannedAt: "2026-10-28T00:00:00Z",
    findings: [
      dummyFinding("legacy/bad.js", "finding-1"),
      dummyFinding("src/good.js", "finding-2"),
    ],
    diagnostics: [],
    coverage: {
      ecosystems: ["npm"],
      filesRead: ["legacy/bad.js", "src/good.js"],
      unsupportedFiles: ["legacy/unknown.txt"],
    },
  };

  const filtered = applyIgnore(scanResult, ["legacy/**"]);
  assert.equal(filtered.findings.length, 1);
  assert.equal(filtered.findings[0]?.id, "finding-2");
  assert.deepEqual(filtered.coverage?.filesRead, ["src/good.js"]);
  assert.deepEqual(filtered.coverage?.unsupportedFiles, []);
});

test("findConfigFile and loadConfig: searches upward and resolves relative baseline paths", async () => {
  const root = await makeTempDir();
  const subDir = join(root, "packages", "app");
  await mkdir(subDir, { recursive: true });

  const configContent = {
    failOn: "high",
    baseline: ["baselines/current.json"],
  };
  await writeFile(join(root, ".evergreen.json"), JSON.stringify(configContent), "utf8");

  const found = await findConfigFile(subDir);
  assert.equal(found, join(root, ".evergreen.json"));

  const loaded = await loadConfig(subDir);
  assert.ok(loaded);
  assert.equal(loaded?.failOn, "high");
  assert.deepEqual(loaded?.baseline, [join(root, "baselines/current.json")]);
});

test("CLI: an unknown key fails with a usage error (exit code 2)", async () => {
  const dir = await makeTempDir();
  await writeFile(join(dir, ".evergreen.json"), JSON.stringify({ unknownSetting: "foo" }));

  const outcome = await runCli(["scan", dir]);
  assert.equal(outcome.code, 2, "exit code must be 2 for usage error");
  assert.match(outcome.stderr, /Unknown key in .*unknownSetting/);

  const jsonOutcome = await runCli(["scan", dir, "--json"]);
  assert.equal(jsonOutcome.code, 2);
  const errorDoc = JSON.parse(jsonOutcome.stdout);
  assert.equal(errorDoc.schemaVersion, "evergreen.error.v1");
  assert.equal(errorDoc.error.code, "usage");
  assert.equal(errorDoc.error.exitCode, 2);
});

test("CLI: a config file changes a scan's result and a flag overrides it (fail-on)", async () => {
  const dir = await makeTempDir();
  // Create a minimal package.json using a deprecated package (request 2.88.2)
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-app",
      dependencies: { request: "2.88.2" },
    }),
  );

  // Without config, scan exits 0 (default --fail-on none)
  const defaultScan = await runCli(["scan", dir]);
  assert.equal(defaultScan.code, 0, "default scan should exit 0");

  // With .evergreen.json setting failOn: "high", scan should exit 1 (policy violation)
  await writeFile(join(dir, ".evergreen.json"), JSON.stringify({ failOn: "high" }));
  const configScan = await runCli(["scan", dir]);
  assert.equal(configScan.code, 1, "scan with config failOn: high should exit 1");
  assert.match(configScan.stderr, /at high or above \(--fail-on high\)/);

  // Passing --fail-on none on the CLI overrides the config file and exits 0
  const flagOverrideScan = await runCli(["scan", dir, "--fail-on", "none"]);
  assert.equal(flagOverrideScan.code, 0, "CLI flag --fail-on none should override config file");
});

test("CLI: a config file changes a scan's result and a flag overrides it (ignore)", async () => {
  const dir = await makeTempDir();
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "root-app",
      workspaces: ["legacy"],
    }),
  );
  const sub = join(dir, "legacy");
  await mkdir(sub, { recursive: true });
  await writeFile(
    join(sub, "package.json"),
    JSON.stringify({
      name: "legacy-app",
      dependencies: { request: "2.88.2" },
    }),
  );

  // Scan without ignore finds request in legacy/package.json
  const initialScan = await runCli(["scan", dir, "--json"]);
  assert.equal(initialScan.code, 0);
  const initialResult = JSON.parse(initialScan.stdout);
  assert.ok(initialResult.findings.length > 0, "should have finding before ignore");

  // With .evergreen.json setting ignore: ["legacy/**"], the finding is excluded
  await writeFile(join(dir, ".evergreen.json"), JSON.stringify({ ignore: ["legacy/**"] }));
  const ignoredScan = await runCli(["scan", dir, "--json"]);
  assert.equal(ignoredScan.code, 0);
  const ignoredResult = JSON.parse(ignoredScan.stdout);
  assert.equal(ignoredResult.findings.length, 0, "findings should be ignored by config file");

  // Passing --ignore "" or --ignore other on CLI overrides config file ignore and finding resurfaces
  const flagOverrideScan = await runCli(["scan", dir, "--ignore", "other/**", "--json"]);
  assert.equal(flagOverrideScan.code, 0);
  const flagResult = JSON.parse(flagOverrideScan.stdout);
  assert.ok(flagResult.findings.length > 0, "CLI flag should override config file ignore");
});

test("CLI: a config file changes a scan's result and a flag overrides it (baseline)", async () => {
  const dir = await makeTempDir();
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-app",
      dependencies: { request: "2.88.2" },
    }),
  );

  // Generate a baseline file
  const baselineFile = join(dir, "base.json");
  const baseGen = await runCli(["baseline", dir, "--output", baselineFile]);
  assert.equal(baseGen.code, 0);

  // Create an empty baseline file to use as an override
  const emptyBaseline = join(dir, "empty.json");
  await writeFile(
    emptyBaseline,
    JSON.stringify({
      schemaVersion: "evergreen.baseline.v1",
      createdAt: new Date().toISOString(),
      findings: [],
    }),
  );

  // Scan without config has findings
  const initialScan = await runCli(["scan", dir, "--json"]);
  assert.equal(initialScan.code, 0);
  assert.ok(JSON.parse(initialScan.stdout).findings.length > 0);

  // With .evergreen.json setting baseline, findings are suppressed
  await writeFile(join(dir, ".evergreen.json"), JSON.stringify({ baseline: ["base.json"] }));
  const baselineScan = await runCli(["scan", dir, "--json"]);
  assert.equal(baselineScan.code, 0);
  assert.equal(JSON.parse(baselineScan.stdout).findings.length, 0, "findings should be suppressed by baseline");

  // CLI --baseline flag overrides config's baseline
  const overrideScan = await runCli(["scan", dir, "--baseline", emptyBaseline, "--json"]);
  assert.equal(overrideScan.code, 0);
  assert.ok(JSON.parse(overrideScan.stdout).findings.length > 0, "CLI --baseline flag should override config file");
});

test("CLI: a config file changes a scan's result and a flag overrides it (data-version)", async () => {
  const dir = await makeTempDir();
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "test-app" }));

  // With .evergreen.json setting dataVersion: "2999.01.01" (un-cached pin)
  await writeFile(join(dir, ".evergreen.json"), JSON.stringify({ dataVersion: "2999.01.01" }));
  const configScan = await runCli(["scan", dir]);
  assert.equal(configScan.code, 3, "un-cached dataVersion in config should fail with exit code 3 (data)");
  assert.match(configScan.stderr, /2999\.01\.01 is pinned/);

  // Passing --data-version bundled on CLI overrides config file
  const overrideScan = await runCli(["scan", dir, "--data-version", "bundled"]);
  assert.equal(overrideScan.code, 0, "CLI --data-version bundled should override config file and succeed");
});

