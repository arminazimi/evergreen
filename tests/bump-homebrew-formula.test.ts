import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

const scriptPath = resolve(".github/scripts/bump-homebrew-formula.mjs");
const script = (await import(pathToFileURL(scriptPath).href)) as {
  readPinnedVersion(source: string): string | null;
  bumpFormula(
    source: string,
    args: { version: string; sha256: string },
  ): { content: string; previousVersion: string | null; changed: boolean };
};

const SAMPLE = `class Evergreen < Formula
  desc "Find evidence-backed deprecations and end-of-life dependencies"
  homepage "https://arminazimi.github.io/evergreen/"
  url "https://registry.npmjs.org/evergreen-deprecation/-/evergreen-deprecation-0.4.0.tgz"
  sha256 "bcac89e8a522779fca12870f517880f714da1dd34e5466d8b8dd540ccd901c1e"
  license "Apache-2.0"
end
`;

const NEXT_SHA = "3acc4fd1807eaab35e022f63c527f3693aa9de7d3bf05c58dec509ebf2bb9542";

test("readPinnedVersion extracts the npm version from the url pin", () => {
  assert.equal(script.readPinnedVersion(SAMPLE), "0.4.0");
  assert.equal(script.readPinnedVersion("no pin here"), null);
});

test("bumpFormula rewrites the url and sha256 and reports the previous version", () => {
  const result = script.bumpFormula(SAMPLE, { version: "0.7.1", sha256: NEXT_SHA });
  assert.equal(result.changed, true);
  assert.equal(result.previousVersion, "0.4.0");
  assert.equal(script.readPinnedVersion(result.content), "0.7.1");
  assert.match(result.content, new RegExp(`sha256 "${NEXT_SHA}"`));
  assert.match(
    result.content,
    /url "https:\/\/registry\.npmjs\.org\/evergreen-deprecation\/-\/evergreen-deprecation-0\.7\.1\.tgz"/,
  );
});

test("bumpFormula is a no-op when the pin already matches", () => {
  const already = script.bumpFormula(SAMPLE, {
    version: "0.4.0",
    sha256: "bcac89e8a522779fca12870f517880f714da1dd34e5466d8b8dd540ccd901c1e",
  });
  assert.equal(already.changed, false);
  assert.equal(already.content, SAMPLE);
});

test("bumpFormula refuses bad inputs and formulas that are not a single npm pin", () => {
  assert.throws(() => script.bumpFormula(SAMPLE, { version: "latest", sha256: NEXT_SHA }), /Invalid version/);
  assert.throws(() => script.bumpFormula(SAMPLE, { version: "0.7.1", sha256: "deadbeef" }), /Invalid sha256/);
  assert.throws(() => script.bumpFormula("class X; end", { version: "0.7.1", sha256: NEXT_SHA }), /missing the evergreen-deprecation npm url/);
  const twoUrls = SAMPLE.replace(
    "license",
    `url "https://registry.npmjs.org/evergreen-deprecation/-/evergreen-deprecation-0.5.0.tgz"\n  license`,
  );
  assert.throws(() => script.bumpFormula(twoUrls, { version: "0.7.1", sha256: NEXT_SHA }), /exactly one url/);
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

test("the command line rewrites the file and prints GITHUB_OUTPUT lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "evergreen-brew-"));
  const file = join(dir, "evergreen.rb");
  writeFileSync(file, SAMPLE);
  const bumped = run("--version", "0.7.1", "--sha256", NEXT_SHA, "--file", file);
  assert.equal(bumped.status, 0, bumped.stderr);
  assert.equal(bumped.stdout, "changed=true\nversion=0.7.1\nprevious=0.4.0\n");
  assert.equal(script.readPinnedVersion(readFileSync(file, "utf8")), "0.7.1");
  const again = run("--version", "0.7.1", "--sha256", NEXT_SHA, "--file", file);
  assert.equal(again.status, 0);
  assert.equal(again.stdout, "changed=false\nversion=0.7.1\nprevious=0.7.1\n");
  assert.equal(run("--version", "0.7.1").status, 1, "missing arguments are a usage error");
});

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Workflow {
  jobs: Record<
    string,
    {
      if?: string;
      permissions?: Record<string, string>;
      concurrency?: { group: string; "cancel-in-progress"?: boolean };
      steps: Step[];
    }
  >;
}

test("the release workflow bumps the tap after a successful publish and skips pre-releases", () => {
  const workflow = parse(readFileSync(resolve(".github/workflows/release.yml"), "utf8")) as Workflow;
  const job = workflow.jobs.homebrew;
  assert.ok(job, "release.yml has no homebrew job");
  assert.match(job.if ?? "", /workflow_run/);
  assert.match(job.if ?? "", /conclusion == 'success'/);
  assert.equal(job.concurrency?.group, "homebrew-tap");
  assert.deepEqual(job.permissions, { contents: "read" });

  const text = job.steps.map((step) => [step.name, step.if, step.run, step.uses, JSON.stringify(step.with), JSON.stringify(step.env)].join("\n")).join("\n");
  assert.match(text, /bump-homebrew-formula\.mjs/);
  assert.match(text, /HOMEBREW_TAP_DEPLOY_KEY/);
  assert.match(text, /arminazimi\/homebrew-tap/);
  assert.match(text, /version.*\*-\*/);
  assert.match(text, /sha256sum|shasum -a 256/);
  assert.doesNotMatch(text, /curl .* \| *bash/, "the job must not pipe remote scripts into a shell");

  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout") && String(step.with?.repository ?? "").includes("homebrew-tap"));
  assert.ok(checkout, "the job checks out the Homebrew tap");
  assert.equal(checkout.with?.["ssh-key"], "${{ secrets.HOMEBREW_TAP_DEPLOY_KEY }}");
  assert.ok(job.steps.some((step) => step.run?.includes("git push")), "the job pushes the bump");
});
