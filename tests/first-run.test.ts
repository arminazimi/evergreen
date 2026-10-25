import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { renderFirstRunSummary, renderText } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function result(count: number): ScanResult {
  return {
    root: "/repo",
    findings: Array.from({ length: count }, (_, index) => ({
      severity: "high",
      title: `Finding ${index + 1}`,
      location: { path: `file${index + 1}.json`, line: index + 1 },
      confidence: "high",
      summary: "Summary",
      sources: [],
    })),
    diagnostics: [],
  } as unknown as ScanResult;
}

test("the first-run summary names a headline, the top three findings, and the next command", () => {
  const lines = renderFirstRunSummary(result(5)).join("\n");
  assert.match(lines, /Found 5 lifecycle risks/);
  assert.match(lines, /Finding 3 \(file3\.json:3\)/);
  assert.doesNotMatch(lines, /Finding 4/);
  assert.match(lines, /and 2 more below/);
  assert.match(lines, /evergreen init --personal/);
});

test("the first-run summary says so when nothing is found", () => {
  assert.match(renderFirstRunSummary(result(0)).join("\n"), /No lifecycle risks found/);
});

test("renderText adds the summary only when asked", () => {
  assert.doesNotMatch(renderText(result(1)), /Next: run/);
  assert.match(renderText(result(1), { firstRun: true }), /^Found 1 lifecycle risk\./);
});

test("the CLI shows the summary in text output without a config, never in JSON or with one", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-first-run-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const home = join(root, "home");
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };

  const first = await execute(process.execPath, [cli, "scan", root], { env });
  assert.match(first.stdout, /Next: run `evergreen init --personal`/);

  const json = await execute(process.execPath, [cli, "scan", root, "--json"], { env });
  assert.doesNotMatch(json.stdout, /Next: run/);

  await mkdir(join(home, ".config", "evergreen"), { recursive: true });
  await writeFile(join(home, ".config", "evergreen", "config.json"), "{}\n");
  const configured = await execute(process.execPath, [cli, "scan", root], { env });
  assert.doesNotMatch(configured.stdout, /Next: run/);
});
