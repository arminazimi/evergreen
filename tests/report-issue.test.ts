import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { redactLine } from "../src/report-issue.js";
import { runCli } from "./cli-runner.js";

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
  assert.equal(
    redactLine("registry=https://me:s3cret@npm.example.com/", "/x"),
    "registry=https://<redacted>@npm.example.com/",
  );
  assert.equal(redactLine('"authToken": "abc123"', "/x"), '"authToken": "<redacted>"');
  assert.equal(redactLine("path=/home/me/project/src", "/home/me/project"), "path=<repo>/src");
  assert.ok(redactLine("a".repeat(500), "/x").length <= 201);
});

test("report-issue writes only the rule, evidence, and a few lines, and the excerpt reproduces the finding", async () => {
  const root = await temporary();
  await mkdir(join(root, "services", "private-api"), { recursive: true });
  await writeFile(join(root, "services", "private-api", "Dockerfile"), "FROM node:14\nRUN echo hi\n");
  const scanned = await runCli(["scan", root, "--json"]);
  assert.equal(scanned.code, 0);
  const scan = JSON.parse(scanned.stdout) as {
    findings: Array<{ id: string; ruleId: string }>;
  };
  assert.ok(scan.findings.length > 0);
  const finding = scan.findings[0]!;

  const reported = await runCli(["report-issue", finding.id, root]);
  assert.equal(reported.code, 0);
  assert.match(
    reported.stdout,
    new RegExp(`Possible false positive: \`${finding.ruleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``),
  );
  assert.match(reported.stdout, /\[[^\]]+\]\(https?:\/\//);
  assert.doesNotMatch(reported.stdout, /private-api/);
  assert.ok(!reported.stdout.includes(root));

  const excerpt = /```\n([\s\S]*?)\n```/.exec(reported.stdout)?.[1];
  assert.equal(excerpt, "FROM node:14\nRUN echo hi\n");

  const replay = await temporary();
  await writeFile(join(replay, "Dockerfile"), `${excerpt}\n`);
  const replayed = await runCli(["scan", replay, "--json"]);
  assert.equal(replayed.code, 0);
  const again = JSON.parse(replayed.stdout) as {
    findings: Array<{ ruleId: string }>;
  };
  assert.ok(again.findings.some((candidate) => candidate.ruleId === finding.ruleId));
});

test("report-issue --output writes a file and an unknown finding fails", async () => {
  const root = await temporary();
  await writeFile(join(root, "Dockerfile"), "FROM node:14\n");
  const scanned = await runCli(["scan", root, "--json"]);
  assert.equal(scanned.code, 0);
  const scan = JSON.parse(scanned.stdout) as { findings: Array<{ id: string }> };
  const output = join(root, "report.md");
  const written = await runCli(["report-issue", scan.findings[0]!.id, root, "--output", output]);
  assert.equal(written.code, 0);
  assert.match(await readFile(output, "utf8"), /Manifest excerpt/);
  const missing = await runCli(["report-issue", "nope", root]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /Finding not found: nope/);
  const noId = await runCli(["report-issue"]);
  assert.notEqual(noId.code, 0);
  assert.match(noId.stderr, /Missing finding ID/);
});
