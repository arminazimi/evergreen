import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const cli = resolve("dist/src/cli.js");

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
  const firstScan = await execute(process.execPath, [cli, "scan", root, "--json"]);
  const result = JSON.parse(firstScan.stdout) as { findings: Array<{ id: string }> };
  assert.equal(result.findings.length, 2);

  const explanation = await execute(process.execPath, [
    cli,
    "explain",
    result.findings[0]?.id ?? "",
    root,
  ]);
  assert.match(explanation.stdout, /Sources:/);

  const context = await execute(process.execPath, [
    cli,
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
  await execute(process.execPath, [cli, "baseline", root, "--output", baselinePath]);
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as { findings: unknown[] };
  assert.equal(baseline.findings.length, 2);

  const filteredScan = await execute(process.execPath, [
    cli,
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
  const textResult = await execute(process.execPath, [cli, "doctor", root]);
  assert.match(textResult.stdout, /Evergreen doctor/);
  assert.match(textResult.stdout, /Privacy: no repository data was uploaded/);

  const jsonResult = await execute(process.execPath, [cli, "doctor", root, "--json"]);
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
  try {
    await execute(process.execPath, [cli, ...args]);
  } catch (error) {
    return error as { code: number; stdout: string; stderr: string };
  }
  assert.fail(`expected "evergreen ${args.join(" ")}" to fail`);
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
