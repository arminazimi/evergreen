import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { compareReleases, driftCollectors } from "../src/drift/index.js";
import type { DriftReport } from "../src/drift/index.js";
import { materializeExample } from "../tools/examples.js";
import { runCli } from "./cli-runner.js";

// Exit criterion of the drift epic: for every collector with `align`, the printed patch passes `git apply --check`
// and, once applied, a second `drift --check` for that runtime exits 0. The input is the committed example, the
// repository a user sees first.

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Erlang/OTP pins live in the Elixir example. */
const EXAMPLE_FOR: Record<string, string> = { erlang: "elixir" };

for (const collector of driftCollectors.filter((candidate) => candidate.align !== undefined)) {
  test(`${collector.runtime}: the --align patch applies and the second drift --check exits 0`, async () => {
    const root = await materializeExample(`drift/${EXAMPLE_FOR[collector.runtime] ?? collector.runtime}`);
    roots.push(dirname(root));

    const before = await runCli(["drift", root, "--runtime", collector.runtime, "--json"]);
    const report = JSON.parse(before.stdout) as DriftReport;
    const runtime = report.runtimes.find((entry) => entry.runtime === collector.runtime);
    assert.ok(runtime?.drifted, `${collector.runtime} example must drift`);
    const release = runtime.pins
      .map((pin) => pin.release)
      .filter((value): value is string => value !== undefined)
      .sort(compareReleases)
      .at(-1) as string;

    const aligned = await runCli(["drift", root, "--runtime", collector.runtime, "--align", release]);
    assert.equal(aligned.code, 0, aligned.stderr);
    assert.notEqual(aligned.stdout, "", "the patch is empty");
    const patchFile = join(dirname(root), `${collector.runtime}.patch`);
    await writeFile(patchFile, aligned.stdout);

    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    const check = spawnSync("git", ["apply", "--check", patchFile], { cwd: root, encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(spawnSync("git", ["apply", patchFile], { cwd: root, encoding: "utf8" }).status, 0);

    const recheck = await runCli(["drift", root, "--runtime", collector.runtime, "--check"]);
    assert.equal(recheck.code, 0, `${recheck.stdout}${recheck.stderr}`);
  });
}
