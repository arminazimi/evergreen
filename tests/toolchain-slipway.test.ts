import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

const fixture = resolve("tests/fixtures/toolchain/slipway-site");

const observed = async () => {
  const scan = await scanRepository(fixture, builtInDetectors, { noCache: true });
  return scan.findings
    .map((finding) => ({
      detector: finding.detector,
      ruleId: finding.ruleId,
      path: finding.location.path,
      line: finding.location.line,
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
};

test("the Slipway-shaped site has the files the Pages build reads", async () => {
  for (const path of ["Gemfile", "Gemfile.lock", "_config.yml", "index.md", ".ruby-version", ".github/workflows/pages.yml"]) {
    await access(join(fixture, path));
  }
});

test("a Jekyll and GitHub Pages site reports its pinned Ruby, yanked gem, and retired Actions", async () => {
  assert.deepEqual(await observed(), [
    { detector: "github-actions", ruleId: "github-actions.checkout.node20", path: ".github/workflows/pages.yml", line: 21 },
    { detector: "github-actions", ruleId: "github-actions.deploy-pages.node20", path: ".github/workflows/pages.yml", line: 40 },
    { detector: "ruby", ruleId: "ruby.gem.json.yanked-2.17.1.1", path: "Gemfile.lock", line: 4 },
    { detector: "ruby", ruleId: "ruby.runtime.eol-3.2", path: ".ruby-version", line: 1 },
    { detector: "ruby", ruleId: "ruby.runtime.eol-3.2", path: "Gemfile.lock", line: 14 },
  ]);
});

test("the scan is deterministic", async () => {
  assert.deepEqual(await observed(), await observed());
});
