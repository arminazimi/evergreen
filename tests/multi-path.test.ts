import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

async function projectsFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "evergreen-multi-"));
  temporaryRoots.push(folder);
  for (const [name, node] of [["beta", "20"], ["alpha", "20"], ["gamma", "24"]] as const) {
    await mkdir(join(folder, name, ".git"), { recursive: true });
    await writeFile(join(folder, name, "package.json"), JSON.stringify({ engines: { node } }));
  }
  await mkdir(join(folder, "not-a-repo"));
  return folder;
}

test("scan accepts several paths and prints per-project counts and a total", async () => {
  const folder = await projectsFolder();
  const { stdout } = await execute(process.execPath, [cli, "scan", join(folder, "beta"), join(folder, "alpha"), "--json"]);
  const result = JSON.parse(stdout) as { schemaVersion: string; projects: Array<{ path: string; findings: number }>; total: { projects: number; findings: number } };
  assert.equal(result.schemaVersion, "evergreen.multi-scan.v1");
  assert.deepEqual(result.projects.map((project) => project.path), [join(folder, "alpha"), join(folder, "beta")]);
  assert.equal(result.total.projects, 2);
  assert.equal(result.total.findings, result.projects.reduce((sum, project) => sum + project.findings, 0));
});

test("scan --all scans every repository in a folder in sorted order", async () => {
  const folder = await projectsFolder();
  const { stdout } = await execute(process.execPath, [cli, "scan", "--all", folder]);
  const lines = stdout.trim().split("\n");
  assert.match(lines[0] ?? "", /alpha: \d+ findings?$/);
  assert.match(lines[1] ?? "", /beta: \d+ findings?$/);
  assert.match(lines[2] ?? "", /gamma: \d+ findings?$/);
  assert.doesNotMatch(stdout, /not-a-repo/);
  assert.match(lines.at(-1) ?? "", /^Total: \d+ findings? across 3 projects$/);
  const again = await execute(process.execPath, [cli, "scan", "--all", folder]);
  assert.equal(again.stdout, stdout);
});

test("scan --all fails clearly when the folder has no repositories", async () => {
  const folder = await mkdtemp(join(tmpdir(), "evergreen-multi-empty-"));
  temporaryRoots.push(folder);
  await assert.rejects(execute(process.execPath, [cli, "scan", "--all", folder]), /No Git repositories found/);
});
