import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { classify, compare, report, xeolMatches } from "../benchmarks/differential/xeol.js";
import type { EvergreenFinding } from "../benchmarks/differential/xeol.js";

interface Fixture {
  repository: string;
  xeol: unknown;
  findings: EvergreenFinding[];
}

async function fixtures(): Promise<Fixture[]> {
  const directory = resolve("tests/fixtures/xeol");
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(resolve(directory, name), "utf8")) as Fixture));
}

test("umami: both tools call Next.js 13 end of life, and the rest is one-sided", async () => {
  const umami = (await fixtures()).find((item) => item.repository === "umami-software/umami")!;
  const result = report(umami.repository, umami.findings, xeolMatches(umami.xeol));
  const byProduct = (product: string) => result.comparisons.find((item) => item.product === product)!;
  assert.equal(byProduct("next").outcome, "agree");
  assert.deepEqual(byProduct("next").xeol.map((item) => [item.cycle, item.version, item.path]), [["13", "13.2.4", "yarn.lock"]]);
  assert.equal(byProduct("vue").outcome, "xeol-only");
  assert.equal(byProduct("nodejs").outcome, "evergreen-only");
  assert.equal(byProduct("postgresql").outcome, "evergreen-only");
  assert.deepEqual(result.summary, { agree: 1, "evergreen-only": 4, "xeol-only": 1 });
});

test("every committed comparison is deterministic and counts each product once", async () => {
  for (const fixture of await fixtures()) {
    const matches = xeolMatches(fixture.xeol);
    const first = report(fixture.repository, fixture.findings, matches);
    assert.deepEqual(first, report(fixture.repository, [...fixture.findings].reverse(), [...matches].reverse()), fixture.repository);
    assert.equal(new Set(first.comparisons.map((item) => item.product)).size, first.comparisons.length, fixture.repository);
    assert.equal(Object.values(first.summary).reduce((total, count) => total + count, 0), first.comparisons.length);
  }
});

test("rule ids map to the xeol product", () => {
  assert.equal(classify({ ruleId: "nodejs.runtime.eol-20", path: "package.json" }), "nodejs");
  assert.equal(classify({ ruleId: "container.golang.eol-1.25-and-older", path: "Dockerfile" }), "go");
  assert.equal(classify({ ruleId: "container.postgres.eol-13-and-older", path: "Dockerfile" }), "postgresql");
  assert.equal(classify({ ruleId: "npm.package.next.13.support-end", path: "package.json" }), "next");
  assert.equal(classify({ ruleId: "npm.package.node-sass.eol", path: "package.json" }), "node-sass");
  assert.equal(classify({ ruleId: "github-actions.checkout.node20", path: "ci.yml" }), undefined);
});

test("families xeol has no product for are listed as not comparable, never as disagreements", () => {
  const result = compare([{ ruleId: "github-actions.checkout.node20", path: ".github/workflows/ci.yml" }], []);
  assert.deepEqual(result, { comparisons: [], notComparable: ["github-actions.checkout"] });
});

test("a product xeol reports under an alias still agrees", () => {
  const matches = xeolMatches({ matches: [{ Cycle: { ProductName: "postgres", ReleaseCycle: "12", Eol: "2024-11-14" }, artifact: { name: "postgres", version: "12.1", type: "deb", locations: [{ path: "/var/lib/dpkg/status" }] } }] });
  const result = compare([{ ruleId: "container.postgres.eol-13-and-older", path: "Dockerfile" }], matches);
  assert.deepEqual(result.comparisons.map((item) => [item.product, item.outcome]), [["postgresql", "agree"]]);
});
