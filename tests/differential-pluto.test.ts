import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { classify, compare, plutoItems, report } from "../benchmarks/differential/pluto.js";
import type { EvergreenFinding } from "../benchmarks/differential/pluto.js";

interface Fixture {
  repository: string;
  pluto: unknown;
  findings: EvergreenFinding[];
}

async function fixtures(): Promise<Fixture[]> {
  const directory = resolve("tests/fixtures/pluto");
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(resolve(directory, name), "utf8")) as Fixture));
}

const run = (fixture: Fixture) => report(fixture.repository, fixture.findings, plutoItems(fixture.pluto, "/repo"));

test("kubernetes-in-action: every Evergreen finding is a removed version Pluto also reports", async () => {
  const fixture = (await fixtures()).find((item) => item.repository === "luksa/kubernetes-in-action")!;
  const result = run(fixture);
  assert.equal(result.summary.agree, fixture.findings.length);
  assert.deepEqual([result.summary["evergreen-only"], result.summary["pluto-only"]], [0, 0]);
});

test("a Helm template is Evergreen-only, and a kind: List item or a test directory is Pluto-only", async () => {
  const janus = run((await fixtures()).find((item) => item.repository === "motiv-labs/janus")!);
  assert.deepEqual(janus.comparisons.map((item) => [item.path, item.outcome]), [["janus/templates/ingress.yaml", "evergreen-only"], ["janus/templates/pdb.yaml", "evergreen-only"]]);
  const skor = run((await fixtures()).find((item) => item.repository === "hasura/skor")!);
  assert.deepEqual(skor.comparisons.map((item) => [item.path, item.outcome]), [["k8s.yaml", "pluto-only"]]);
});

test("every committed comparison is deterministic and counts each manifest once", async () => {
  for (const fixture of await fixtures()) {
    const items = plutoItems(fixture.pluto, "/repo");
    const first = run(fixture);
    assert.deepEqual(first, report(fixture.repository, [...fixture.findings].reverse(), [...items].reverse()), fixture.repository);
    assert.equal(Object.values(first.summary).reduce((total, count) => total + count, 0), first.comparisons.length);
  }
});

test("rule ids map to the kind and version Pluto names, with dots in the group written as dashes", () => {
  assert.deepEqual(classify({ ruleId: "kubernetes.extensions.ingress.v1beta1.removed", path: "a.yaml" }), { kind: "ingress", version: "extensions/v1beta1" });
  assert.deepEqual(classify({ ruleId: "kubernetes.networking-k8s-io.ingress.v1beta1.removed", path: "a.yaml" }), { kind: "ingress", version: "networking-k8s-io/v1beta1" });
  assert.equal(classify({ ruleId: "container.node.eol-21-and-older", path: "Dockerfile" }), undefined);
});

test("a networking.k8s.io version matches its dashed rule form, and a deprecated-but-served version is not a disagreement", () => {
  const items = plutoItems({ items: [
    { filePath: "/repo/a.yaml", api: { version: "networking.k8s.io/v1beta1", kind: "Ingress" }, deprecated: true, removed: true },
    { filePath: "/repo/b.yaml", api: { version: "autoscaling/v2", kind: "HorizontalPodAutoscaler" }, deprecated: true, removed: false },
  ] }, "/repo");
  const result = compare([{ ruleId: "kubernetes.networking-k8s-io.ingress.v1beta1.removed", path: "a.yaml" }], items);
  assert.deepEqual(result.comparisons.map((item) => item.outcome), ["agree", "pluto-deprecated-only"]);
});

test("non-Kubernetes findings are listed as not comparable", () => {
  assert.deepEqual(compare([{ ruleId: "github-actions.checkout.node20", path: "ci.yml" }], []), { comparisons: [], notComparable: ["github-actions.checkout"] });
});
