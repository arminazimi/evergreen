import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { classify, compare, renovateDependencies, report } from "../benchmarks/differential/renovate.js";
import type { EvergreenFinding } from "../benchmarks/differential/renovate.js";

interface Fixture {
  repository: string;
  renovate: unknown;
  findings: EvergreenFinding[];
}

async function fixtures(): Promise<Fixture[]> {
  const directory = resolve("tests/fixtures/differential");
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(resolve(directory, name), "utf8")) as Fixture));
}

test("umami: image findings agree with Renovate updates, deprecations are Renovate-only, and skipped lookups are inconclusive", async () => {
  const umami = (await fixtures()).find((item) => item.repository === "umami-software/umami")!;
  const result = report(umami.repository, umami.findings, renovateDependencies(umami.renovate));
  assert.deepEqual(result.summary, { agree: 2, "evergreen-only": 0, "renovate-only": 2, inconclusive: 4 });
  const byName = (name: string) => result.comparisons.filter((item) => item.name === name);
  assert.deepEqual(byName("node").map((item) => [item.outcome, item.renovate]), [["agree", "major-update"]]);
  assert.deepEqual(byName("postgres").map((item) => [item.outcome, item.renovate]), [["agree", "major-update"]]);
  assert.deepEqual(byName("checkout").map((item) => item.renovate), ["skipped", "skipped", "skipped"]);
  assert.match(byName("checkout")[0]!.note, /github-token-required/);
  assert.deepEqual(result.comparisons.filter((item) => item.outcome === "renovate-only").map((item) => item.name), ["react-beautiful-dnd", "rollup-plugin-terser"]);
});

test("every committed comparison accounts for each Evergreen finding family exactly once and is deterministic", async () => {
  for (const fixture of await fixtures()) {
    const dependencies = renovateDependencies(fixture.renovate);
    const first = report(fixture.repository, fixture.findings, dependencies);
    assert.deepEqual(first, report(fixture.repository, [...fixture.findings].reverse(), dependencies), fixture.repository);
    const comparable = fixture.findings.filter((finding) => classify(finding));
    const covered = first.comparisons.filter((item) => item.outcome !== "renovate-only").reduce((total, item) => total + item.evergreen.length, 0);
    assert.ok(covered <= comparable.length && covered > 0 || comparable.length === 0, fixture.repository);
    assert.equal(Object.values(first.summary).reduce((total, count) => total + count, 0), first.comparisons.length);
  }
});

test("rule ids map to the dependency Renovate would name", () => {
  assert.deepEqual(classify({ ruleId: "npm.package.node-sass.eol", path: "package.json" }), { family: "deprecated-package", name: "node-sass" });
  assert.deepEqual(classify({ ruleId: "container.postgres.eol-13-and-older", path: "Dockerfile" }), { family: "base-image", name: "postgres" });
  assert.deepEqual(classify({ ruleId: "github-actions.setup-node.node20", path: "ci.yml" }), { family: "github-action", name: "setup-node" });
  assert.equal(classify({ ruleId: "nodejs.runtime.eol-20", path: "package.json" }), undefined);
});

test("runtime findings are listed as not comparable, never counted as disagreements", () => {
  const result = compare([{ ruleId: "python.runtime.eol-3.9-and-older", path: "pyproject.toml" }], []);
  assert.deepEqual(result, { comparisons: [], notComparable: ["python.runtime"] });
});

test("a finding in a file Renovate never listed is Evergreen-only, and says so", () => {
  const result = compare([{ ruleId: "container.node.eol-21-and-older", path: "docker/Dockerfile" }], []);
  assert.deepEqual(result.comparisons.map((item) => [item.outcome, item.renovate]), [["evergreen-only", "not-seen"]]);
});

test("scoped npm names match their dashed rule names", () => {
  const dependencies = renovateDependencies({ repositories: { r: { packageFiles: { npm: [{ packageFile: "package.json", deps: [{ depName: "@hapi/joi", deprecationMessage: "deprecated" }] }] } } } });
  const result = compare([{ ruleId: "npm.package.hapi-joi.deprecated", path: "package.json" }], dependencies);
  assert.deepEqual(result.comparisons.map((item) => item.outcome), ["agree"]);
});
