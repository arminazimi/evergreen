import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { redactLine } from "../src/report-issue.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporary(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-report-"));
  roots.push(root);
  return root;
}

test("credentials, secret assignments, and the scan root are masked", () => {
  assert.equal(redactLine("registry=https://me:s3cret@npm.example.com/", "/x"), "registry=https://<redacted>@npm.example.com/");
  assert.equal(redactLine('"authToken": "abc123"', "/x"), '"authToken": "<redacted>"');
  assert.equal(redactLine("path=/home/me/project/src", "/home/me/project"), "path=<repo>/src");
  assert.ok(redactLine("a".repeat(500), "/x").length <= 201);
});

test("report-issue writes only the rule, evidence, and a few lines, and the excerpt reproduces the finding", async () => {
  const root = await temporary();
  await mkdir(join(root, "services", "private-api"), { recursive: true });
  await writeFile(join(root, "services", "private-api", "Dockerfile"), "FROM node:14\nRUN echo hi\n");
  const scan = JSON.parse((await execute(process.execPath, [cli, "scan", root, "--json"])).stdout) as {
    findings: Array<{ id: string; ruleId: string }>;
  };
  assert.ok(scan.findings.length > 0);
  const finding = scan.findings[0]!;

  const { stdout } = await execute(process.execPath, [cli, "report-issue", finding.id, root]);
  assert.match(stdout, new RegExp(`Possible false positive: \`${finding.ruleId.replace(/\./g, "\\.")}\``));
  assert.match(stdout, /\[[^\]]+\]\(https?:\/\//);
  assert.doesNotMatch(stdout, /private-api/);
  assert.ok(!stdout.includes(root));

  const excerpt = /```\n([\s\S]*?)\n```/.exec(stdout)?.[1];
  assert.equal(excerpt, "FROM node:14\nRUN echo hi\n");

  const replay = await temporary();
  await writeFile(join(replay, "Dockerfile"), `${excerpt}\n`);
  const again = JSON.parse((await execute(process.execPath, [cli, "scan", replay, "--json"])).stdout) as {
    findings: Array<{ ruleId: string }>;
  };
  assert.ok(again.findings.some((candidate) => candidate.ruleId === finding.ruleId));
});

test("report-issue --output writes a file and an unknown finding fails", async () => {
  const root = await temporary();
  await writeFile(join(root, "Dockerfile"), "FROM node:14\n");
  const scan = JSON.parse((await execute(process.execPath, [cli, "scan", root, "--json"])).stdout) as { findings: Array<{ id: string }> };
  const output = join(root, "report.md");
  await execute(process.execPath, [cli, "report-issue", scan.findings[0]!.id, root, "--output", output]);
  assert.match(await readFile(output, "utf8"), /Manifest excerpt/);
  await assert.rejects(execute(process.execPath, [cli, "report-issue", "nope", root]), /Finding not found: nope/);
  await assert.rejects(execute(process.execPath, [cli, "report-issue"]), /Missing finding ID/);
});
