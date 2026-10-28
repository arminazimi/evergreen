import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { kubernetesApiVersionFixer } from "../src/fix/kubernetes.js";

const fixtures = resolve("tests/fixtures/fix-kubernetes");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-kubernetes-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

test("the fixer output matches the after fixture and leaves spec-change findings alone", async () => {
  const before = await readFile(join(fixtures, "before.yml"), "utf8");
  const after = await readFile(join(fixtures, "after.yml"), "utf8");
  const root = await repository({ "manifests/workloads.yml": before });
  const patches = await kubernetesApiVersionFixer.plan(await scanRepository(root, detectors));

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "manifests/workloads.yml");
  // renderDiff emits one hunk spanning the first to the last change, so rebuild the new side of it and compare with the fixture.
  const hunk = patches[0]!.diff.split("\n").slice(2);
  const start = Number(/^@@ -(\d+)/.exec(hunk[0]!)![1]) - 1;
  const rebuilt = hunk.slice(1).filter((line) => !line.startsWith("-")).map((line) => line.slice(1));
  assert.deepEqual(rebuilt, after.split("\n").slice(start, start + rebuilt.length));
  assert.ok(patches[0]!.diff.includes("\n-apiVersion: batch/v1beta1\n"));
  assert.ok(patches[0]!.diff.includes('+apiVersion: "rbac.authorization.k8s.io/v1"\n'));
  // The Ingress and the PodDisruptionBudget need a spec change, so they stay as the scan reports them.
  assert.ok(rebuilt.includes("apiVersion: networking.k8s.io/v1beta1"));
  assert.ok(rebuilt.includes("apiVersion: policy/v1beta1"));
  assert.equal(await readFile(join(root, "manifests", "workloads.yml"), "utf8"), before);
});

test("the planned patch is idempotent: scanning the fixed file plans nothing", async () => {
  const root = await repository({ "manifests/workloads.yml": await readFile(join(fixtures, "after.yml"), "utf8") });
  assert.deepEqual(await kubernetesApiVersionFixer.plan(await scanRepository(root, detectors)), []);
});

test("a chart template with a literal apiVersion is rewritten where the schema is unchanged", async () => {
  const root = await repository({
    "chart/Chart.yaml": "apiVersion: v2\nname: demo\nversion: 0.1.0\n",
    "chart/templates/cron.yaml": [
      "apiVersion: batch/v1beta1",
      "kind: CronJob",
      "metadata:",
      "  name: {{ include \"demo.fullname\" . }}-nightly",
      "spec:",
      "  schedule: {{ .Values.schedule | quote }}",
      "",
    ].join("\n"),
  });
  const patches = await kubernetesApiVersionFixer.plan(await scanRepository(root, detectors));

  assert.equal(patches.length, 1);
  assert.ok(patches[0]!.diff.includes("+apiVersion: batch/v1\n"));
  assert.ok(patches[0]!.diff.includes("-apiVersion: batch/v1beta1\n"));
});

test("a kustomization patch target is left alone: its version line is not an apiVersion", async () => {
  const root = await repository({
    "kustomization.yaml": [
      "apiVersion: kustomize.config.k8s.io/v1beta1",
      "kind: Kustomization",
      "patches:",
      "  - target:",
      "      group: batch",
      "      version: v1beta1",
      "      kind: CronJob",
      "    patch: |-",
      "      - op: replace",
      "        path: /spec/schedule",
      "        value: \"0 1 * * *\"",
    ].join("\n"),
  });
  assert.deepEqual(await kubernetesApiVersionFixer.plan(await scanRepository(root, detectors)), []);
});

test("a manifest without a trailing newline is left alone", async () => {
  const root = await repository({ "cron.yaml": "apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly" });
  assert.deepEqual(await kubernetesApiVersionFixer.plan(await scanRepository(root, detectors)), []);
});
