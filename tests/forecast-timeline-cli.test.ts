import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-forecast-timeline-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  return root;
}

const run = async (root: string, flags: string[], env: NodeJS.ProcessEnv = {}) =>
  (await execute(process.execPath, [cli, "forecast", root, "--as-of", "2026-10-25", ...flags], { env: { ...process.env, ...env } })).stdout;

test("--timeline draws the forecast as a bar per month instead of the default text", async () => {
  const root = await project();
  const timeline = await run(root, ["--timeline"]);
  assert.match(timeline, /^Forecast from 2026-10-25 to 2027-10-25 \(12 months\)\n\n/);
  assert.match(timeline, /^2026-10 {2}\|$/m);
  assert.match(timeline, /^2027-04 {2}\|[#█]+ +\d+ events?/m);
  assert.doesNotMatch(timeline, /\u001b/);
  assert.notEqual(timeline, await run(root, []));
});

test("--timeline conflicts with --json", async () => {
  const root = await project();
  await assert.rejects(execute(process.execPath, [cli, "forecast", root, "--timeline", "--json"]), (error: { code?: number; stderr?: string }) =>
    error.code === 2 && /either --timeline or --json/.test(error.stderr ?? ""));
});

test("NO_COLOR keeps the timeline plain, and piped output never carries color", async () => {
  const root = await project();
  const plain = await run(root, ["--timeline"], { NO_COLOR: "1" });
  assert.equal(plain, await run(root, ["--timeline"]));
  assert.doesNotMatch(plain, /\u001b/);
});
