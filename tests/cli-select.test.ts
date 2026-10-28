import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const smoke = resolve("tests/fixtures/smoke");
const tempDirs: string[] = [];

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(...args: string[]): Promise<Outcome> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args], { encoding: "utf8" });
    return { code: 0, stdout, stderr: stderr ?? "" };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

/** A tiny npm project with one deprecated dependency and an old Node engine, like the smoke fixture. */
async function makeNpmProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-select-test-"));
  tempDirs.push(dir);
  await mkdir(join(dir, ".github", "workflows"), { recursive: true });
  await writeFile(join(dir, "package.json"), `${JSON.stringify(
    {
      name: "evergreen-select-fixture",
      private: true,
      engines: { node: ">=18.0.0" },
      dependencies: { request: "^2.88.0" },
    },
    null,
    2,
  )}\n`);
  await writeFile(join(dir, ".github", "workflows", "ci.yml"), `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/upload-artifact@v3\n`);
  return dir;
}

test("--only keeps the named ecosystem and labels the JSON and text report", async () => {
  const plain = await runCli("scan", smoke, "--no-cache", "--json");
  assert.equal(plain.code, 0);
  const unselected = JSON.parse(plain.stdout) as { findings: Array<{ ruleId: string; detector: string }> };
  const lot = unselected.findings[0]!.detector;
  const expected = unselected.findings.filter((finding) => finding.detector === lot).map((finding) => finding.ruleId);

  const selected = await runCli("scan", smoke, "--no-cache", "--only", lot, "--json");
  assert.equal(selected.code, 0);
  const json = JSON.parse(selected.stdout) as { findings: Array<{ ruleId: string }>; selection?: { only?: string[] } };
  assert.deepEqual(json.selection, { only: [lot] });
  assert.deepEqual(json.findings.map((finding) => finding.ruleId), expected);

  const text = await runCli("scan", smoke, "--no-cache", "--only", lot);
  assert.equal(text.code, 0);
  assert.match(text.stdout, new RegExp(`Findings: ${expected.length}\\nOnly: ${lot}\\n`));
});

test("--exclude drops a rule prefix and keeps the rest of the scan", async () => {
  const plain = await runCli("scan", smoke, "--no-cache", "--json");
  const unselected = JSON.parse(plain.stdout) as { findings: Array<{ ruleId: string }> };
  const dropped = unselected.findings.find((finding) => finding.ruleId.includes("."))!.ruleId;
  const remaining = unselected.findings.filter((finding) => finding.ruleId !== dropped).map((finding) => finding.ruleId);

  const selected = await runCli("scan", smoke, "--no-cache", "--exclude", dropped, "--json");
  assert.equal(selected.code, 0);
  const json = JSON.parse(selected.stdout) as { findings: Array<{ ruleId: string }>; selection?: { exclude?: string[] } };
  assert.deepEqual(json.selection, { exclude: [dropped] });
  assert.deepEqual(json.findings.map((finding) => finding.ruleId), remaining);
});

test("selectors repeat, combine, and are exclusive rather than additive", async () => {
  const plain = await runCli("scan", smoke, "--no-cache", "--json");
  const unselected = JSON.parse(plain.stdout) as { findings: Array<{ ruleId: string }> };
  const dropped = unselected.findings[0]!.ruleId;

  const combined = await runCli("scan", smoke, "--no-cache", "--only", "npm", "--only", "nodejs", "--exclude", dropped, "--json");
  assert.equal(combined.code, 0);
  const json = JSON.parse(combined.stdout) as { findings: Array<{ ruleId: string }>; selection?: { only?: string[]; exclude?: string[] } };
  assert.deepEqual(json.selection, { only: ["npm", "nodejs"], exclude: [dropped] });
  for (const finding of json.findings) assert.notEqual(finding.ruleId, dropped);
});

test("an unknown selector is a usage error that lists valid values", async () => {
  const soon = await runCli("scan", smoke, "--only", "not-an-ecosystem");
  assert.equal(soon.code, 2);
  assert.match(soon.stderr, /Unknown selector: not-an-ecosystem\./);
  assert.match(soon.stderr, /Valid ecosystems: .*npm/);
  assert.match(soon.stderr, /Valid rule prefixes: .*npm\.package/);

  const withExclude = await runCli("scan", smoke, "--exclude", "nodejs", "--exclude", "bogus");
  assert.equal(withExclude.code, 2);
  assert.match(withExclude.stderr, /Unknown selector: bogus\./);
});

test("--only and --exclude are only available for the scan command", async () => {
  const result = await runCli("check", "pkg:npm/request@2.88.2", "--only", "npm");
  assert.equal(result.code, 2);
  assert.match(result.stderr, /only available for the scan command/);
});

test("selectors filter the per-project counts of a multi-project scan", async () => {
  const npmProject = await makeNpmProject();
  const actionsProject = await mkdtemp(join(tmpdir(), "evergreen-select-test-"));
  tempDirs.push(actionsProject);
  await mkdir(join(actionsProject, ".github", "workflows"), { recursive: true });
  await writeFile(join(actionsProject, ".github", "workflows", "release.yml"), `name: Release\non: [push]\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/upload-artifact@v3\n`);

  const plain = JSON.parse((await runCli("scan", npmProject, actionsProject, "--no-cache", "--json")).stdout) as {
    projects: Array<{ findings: number; result: { findings: Array<{ detector: string }> } }>;
    total: { findings: number };
  };
  assert.ok(plain.projects.some((project) => project.result.findings.some((finding) => finding.detector === "npm")));
  assert.ok(plain.projects.some((project) => project.result.findings.some((finding) => finding.detector === "github-actions")));

  const selected = await runCli("scan", npmProject, actionsProject, "--no-cache", "--only", "npm", "--json");
  assert.equal(selected.code, 0);
  const multi = JSON.parse(selected.stdout) as {
    projects: Array<{ findings: number; result: { findings: Array<{ detector: string }>; selection?: { only?: string[] } } }>;
    total: { findings: number };
  };
  assert.equal(multi.projects.length, 2);
  for (const project of multi.projects) {
    assert.deepEqual(project.result.selection, { only: ["npm"] });
    for (const finding of project.result.findings) assert.equal(finding.detector, "npm");
  }
  assert.equal(multi.total.findings, multi.projects.reduce((sum, project) => sum + project.findings, 0));
});
