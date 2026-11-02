import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { runCli } from "./cli-runner.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cli-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );
  return root;
}

test("CLI scans, explains, creates context, and suppresses baseline findings", async () => {
  const root = await fixtureRepository();
  const firstScan = await runCli(["scan", root, "--json"]);
  const result = JSON.parse(firstScan.stdout) as { findings: Array<{ id: string }> };
  assert.equal(result.findings.length, 2);

  const explanation = await runCli([
    "explain",
    result.findings[0]?.id ?? "",
    root,
  ]);
  assert.match(explanation.stdout, /Sources:/);

  const context = await runCli([
    "context",
    result.findings[0]?.id ?? "",
    root,
    "--json",
  ]);
  const packet = JSON.parse(context.stdout) as {
    schemaVersion: string;
    affectedFiles: string[];
    constraints: string[];
    steps: Array<{ id: string }>;
    verification: unknown[];
  };
  assert.equal(packet.schemaVersion, "evergreen.context.v1");
  assert.ok(packet.affectedFiles.length > 0);
  assert.ok(packet.constraints.length > 0);
  assert.ok(packet.steps.length > 0);
  assert.ok(packet.steps.some((step) => step.id === "upgrade-action-ref"));
  assert.ok(packet.verification.length > 0);

  const baselinePath = join(root, "baseline.json");
  await runCli(["baseline", root, "--output", baselinePath]);
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as { findings: unknown[] };
  assert.equal(baseline.findings.length, 2);

  const filteredScan = await runCli([
    "scan",
    root,
    "--baseline",
    baselinePath,
    "--json",
  ]);
  const filtered = JSON.parse(filteredScan.stdout) as { findings: unknown[]; diagnostics: string[] };
  assert.deepEqual(filtered.findings, []);
  assert.match(filtered.diagnostics.at(-1) ?? "", /Suppressed 2 findings/);
});

test("CLI doctor reports the local environment in text and JSON", async () => {
  const root = await fixtureRepository();
  const textResult = await runCli(["doctor", root]);
  assert.match(textResult.stdout, /Evergreen doctor/);
  assert.match(textResult.stdout, /Privacy: no repository data was uploaded/);

  const jsonResult = await runCli(["doctor", root, "--json"]);
  const result = JSON.parse(jsonResult.stdout) as {
    schemaVersion: string;
    summary: { failed: number };
    checks: Array<{ category: string }>;
  };
  assert.equal(result.schemaVersion, "evergreen.doctor.v1");
  assert.equal(result.summary.failed, 0);
  assert.deepEqual(
    result.checks.map((check) => check.category),
    ["runtime", "package", "mcp", "skill", "plugin", "ci"],
  );
});

async function runFailing(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = await runCli([...args]);
  if (result.code === 0) assert.fail(`expected "evergreen ${args.join(" ")}" to fail`);
  return result;
}

test("CLI rejects a scan path that does not exist or is not a directory", async () => {
  const root = await fixtureRepository();
  const missingScan = await runFailing(["scan", join(root, "missing"), "--json"]);
  assert.equal(missingScan.code, 2);
  assert.match(missingScan.stderr, /Path does not exist/);
  const document = JSON.parse(missingScan.stdout) as { schemaVersion: string; error: { code: string } };
  assert.equal(document.schemaVersion, "evergreen.error.v1");
  assert.equal(document.error.code, "usage");

  const fileScan = await runFailing(["scan", join(root, "package.json")]);
  assert.equal(fileScan.code, 2);
  assert.match(fileScan.stderr, /Not a directory/);
});

test("CLI scan --demo scans an in-memory fixture without shipping a manifest", async () => {
  const textResult = await runCli(["scan", "--demo"]);
  assert.match(textResult.stdout, /Evergreen scan/);
  assert.match(textResult.stdout, /Repository: demo/);
  assert.match(textResult.stdout, /Findings: 5/);
  assert.match(textResult.stdout, /HIGH Unsupported actions\/checkout runtime/);
  assert.match(textResult.stdout, /HIGH request is deprecated/);
  assert.match(textResult.stdout, /MEDIUM Node\.js 18 is end-of-life/);
  assert.match(textResult.stdout, /Confidence:/);
  assert.match(textResult.stdout, /Replacement:/);
  assert.match(textResult.stdout, /Deadline:/);

  const jsonResult = await runCli(["scan", "--demo", "--json"]);
  const scan = JSON.parse(jsonResult.stdout) as {
    schemaVersion: string;
    root: string;
    findings: Array<{ id: string; ruleId: string }>;
  };
  assert.equal(scan.schemaVersion, "evergreen.scan.v1");
  assert.equal(scan.root, "demo");
  assert.equal(scan.findings.length, 5);
  assert.deepEqual(scan.findings.map((finding) => finding.ruleId), [
    "github-actions.checkout.node20",
    "nodejs.runtime.eol-18",
    "nodejs.runtime.eol-19",
    "nodejs.runtime.eol-20",
    "npm.package.request.deprecated",
  ]);

  const invalidUsage = await runFailing(["check", "--demo", "pkg:npm/request@2.88.2"]);
  assert.equal(invalidUsage.code, 2);
  assert.match(invalidUsage.stderr, /--demo is only available for the scan command/);

  const pathUsage = await runFailing(["scan", ".", "--demo"]);
  assert.equal(pathUsage.code, 2);
  assert.match(pathUsage.stderr, /--demo does not take a path argument/);

  const allUsage = await runFailing(["scan", "--demo", "--all", "dir"]);
  assert.equal(allUsage.code, 2);
  assert.match(allUsage.stderr, /--all is not available with --demo/);

  const baselineUsage = await runFailing(["scan", "--demo", "--baseline", "file"]);
  assert.equal(baselineUsage.code, 2);
  assert.match(baselineUsage.stderr, /--baseline and --write-status are not available with --demo/);

  const statusUsage = await runFailing(["scan", "--demo", "--write-status"]);
  assert.equal(statusUsage.code, 2);
  assert.match(statusUsage.stderr, /--baseline and --write-status are not available with --demo/);
});
