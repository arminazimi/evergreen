import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { containerDetector } from "../src/detectors/container/index.js";
import { parseDockerfile } from "../src/detectors/container/parse-dockerfile.js";

const fixtures = resolve("tests/fixtures/container-run-pins");

async function scan(caseName: string) {
  return containerDetector.scan({ root: resolve(fixtures, caseName) });
}

test("judges nvm install literals in continued RUN chains", async () => {
  const findings = await scan("nvm");
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [["nodejs.runtime.legacy", 3]]);
});

test("judges pyenv install literals in RUN chains", async () => {
  const findings = await scan("pyenv");
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [["python.runtime.eol-3.9-and-older", 2]]);
});

test("judges sdk install java literals", async () => {
  const findings = await scan("sdk");
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [["java.jdk.end-of-support-12-16", 2]]);
});

test("judges asdf install literals for runtimes with registry rules", async () => {
  const findings = await scan("asdf");
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [["ruby.runtime.eol-2.7", 2]]);
});

test("skips variables, command substitutions, and subshells", async () => {
  const root = resolve(fixtures, "negative");
  const contents = await readFile(resolve(root, "Dockerfile"), "utf8");
  assert.deepEqual(parseDockerfile(contents).filter((declaration) => declaration.kind === "runtime"), []);
  assert.deepEqual(await scan("negative"), []);
});
