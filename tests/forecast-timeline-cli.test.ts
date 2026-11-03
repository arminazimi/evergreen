import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { runCli } from "./cli-runner.js";

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

const run = async (root: string, flags: string[], env: NodeJS.ProcessEnv = {}) => {
  const result = await runCli(["forecast", root, "--as-of", "2026-10-25", ...flags], { env });
  assert.equal(result.code, 0);
  return result.stdout;
};

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
  const result = await runCli(["forecast", root, "--timeline", "--json"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /either --timeline or --json/);
});

test("NO_COLOR keeps the timeline plain, and piped output never carries color", async () => {
  const root = await project();
  const plain = await run(root, ["--timeline"], { NO_COLOR: "1" });
  assert.equal(plain, await run(root, ["--timeline"]));
  assert.doesNotMatch(plain, /\u001b/);
});
