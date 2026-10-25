import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { parse, parseAllDocuments } from "yaml";

interface Job { variables: Record<string, string>; script: string[] }

// Forward slashes keep the path intact inside a POSIX shell script on Windows too.
const cli = resolve("dist/src/cli.js").replaceAll("\\", "/");
const fixtures = resolve("tests/gitlab/fixtures");

// Runs the component's job script the way a GitLab runner would: inputs substituted, variables exported,
// and the published package replaced by the local build so the run needs no network.
async function runJob(fixture: string, inputs: Record<string, string> = {}) {
  const [spec, body] = parseAllDocuments(await readFile(resolve("templates/evergreen.yml"), "utf8"));
  const declared = (spec!.toJS() as { spec: { inputs: Record<string, { default: unknown }> } }).spec.inputs;
  const substitute = (text: string) =>
    text.replace(/\$\[\[\s*inputs\.(\w+)\s*\]\]/g, (_, name: string) => inputs[name] ?? String(declared[name]!.default));
  const job = (body!.toJS() as { evergreen: Job }).evergreen;
  const published = substitute(job.script.join("\n"));
  const script = published.replace(/npx --yes "evergreen-deprecation@[^"]*"/, `node "${cli}"`);
  assert.notEqual(script, published, "the job script no longer calls the published package through npx");
  const env = Object.fromEntries(Object.entries(job.variables).map(([key, value]) => [key, substitute(String(value))]));
  const dir = await mkdtemp(join(tmpdir(), "evergreen-gitlab-"));
  try {
    await cp(join(fixtures, fixture), dir, { recursive: true });
    const result = spawnSync("sh", ["-c", script], { cwd: dir, env: { ...process.env, ...env }, encoding: "utf8" });
    const report = await readFile(join(dir, env.EVERGREEN_REPORT!), "utf8").catch(() => undefined);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, report: report === undefined ? undefined : (JSON.parse(report) as { findings: unknown[] }) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a pipeline on a clean repository passes and keeps an empty report", async () => {
  const run = await runJob("pass");
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.report?.findings, []);
});

test("a pipeline on a repository with a high-severity finding fails but still keeps the report", async () => {
  const run = await runJob("fail");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /--fail-on high/);
  assert.ok((run.report?.findings.length ?? 0) > 0, "the report must be written before the gate is applied");
});

test("the severity input decides whether the same finding fails the pipeline", async () => {
  const run = await runJob("fail", { fail_on_severity: "none" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok((run.report?.findings.length ?? 0) > 0);
});

test("a baseline input suppresses the findings it records and the pipeline passes", async () => {
  const run = await runJob("baseline", { baseline: ".evergreen-baseline.json" });
  assert.equal(run.status, 0, run.stderr);
});

test("without the baseline input the same repository still fails, so the baseline is what made it pass", async () => {
  const run = await runJob("baseline");
  assert.equal(run.status, 1);
});
