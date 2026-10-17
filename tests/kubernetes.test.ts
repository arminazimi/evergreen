import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { kubernetesDetector } from "../src/detectors/kubernetes/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/kubernetes");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-kubernetes-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function expected(ruleId: string, path: string, line: number, declaration: string): Promise<DetectorFinding> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/kubernetes.json", "utf8")));
  const rule = registry.rules.find((item) => item.id === ruleId)!;
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: `${path} declares ${declaration}. ${rule.summary}`,
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    deadline: rule.deadline!,
    sources: rule.sources,
  };
}

const CRONJOB = "kubernetes.batch.cronjob.v1beta1.removed";
const NETWORKING_INGRESS = "kubernetes.networking-k8s-io.ingress.v1beta1.removed";

test("kubernetes passes detector conformance on every fixture", async () => {
  await runDetectorConformance({
    detector: kubernetesDetector,
    fixtures: [
      {
        name: "kubernetes positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          expected(CRONJOB, "helm/mychart/templates/cronjob.yml", 1, "batch/v1beta1 CronJob"),
          expected(NETWORKING_INGRESS, "helm/mychart/templates/ingress.yaml", 2, "networking.k8s.io/v1beta1 Ingress"),
          expected(NETWORKING_INGRESS, "kustomize/ingress.yaml", 1, "networking.k8s.io/v1beta1 Ingress"),
          expected(CRONJOB, "kustomize/kustomization.yaml", 10, "batch/v1beta1 CronJob"),
          expected("kubernetes.policy.podsecuritypolicy.v1beta1.removed", "manifests/psp.yml", 3, "policy/v1beta1 PodSecurityPolicy"),
          expected("kubernetes.extensions.ingress.v1beta1.removed", "manifests/web.yaml", 2, "extensions/v1beta1 Ingress"),
          expected(CRONJOB, "manifests/web.yaml", 34, "batch/v1beta1 CronJob"),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck],
  });
  await runDetectorConformance({
    detector: kubernetesDetector,
    fixtures: [{ name: "kubernetes negative", root: resolve(fixtures, "negative"), expectedFindings: [] }],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: kubernetesDetector,
    fixtures: [{ name: "kubernetes zero", root: resolve(fixtures, "zero"), expectedFindings: [] }],
    checks: [zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: kubernetesDetector,
    fixtures: [{ name: "kubernetes malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("only a rule's own group, kind, and version produce a finding", async () => {
  const root = await repository({
    "a.yaml": [
      "apiVersion: batch/v1",
      "kind: CronJob",
      "---",
      "apiVersion: batch/v1beta1",
      "kind: Job",
      "---",
      "apiVersion: autoscaling/v2beta1",
      "kind: HorizontalPodAutoscaler",
      "---",
      "apiVersion: autoscaling/v2beta2",
      "kind: HorizontalPodAutoscaler",
      "---",
      "apiVersion: v1",
      "kind: CronJob",
      "---",
      "apiVersion: example.test/v1beta1",
      "kind: CronJob",
      "",
    ].join("\n"),
  });
  const findings = await kubernetesDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [
    ["kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed", 10],
  ]);
});

test("a Helm template is read as a template, and a chart's nested charts and tests are not read", async () => {
  const legacy = "apiVersion: batch/v1beta1\nkind: CronJob\n";
  const root = await repository({
    "chart/Chart.yaml": "apiVersion: v2\nname: chart\nversion: 0.1.0\n",
    "chart/templates/job.yaml": `{{- if .Values.enabled }}\n${legacy}{{- end }}\n`,
    "chart/templates/tests/job.yaml": legacy,
    "chart/charts/sub/templates/job.yaml": legacy,
    "chart/crds/crd.yaml": legacy,
    "chart/values.yaml": legacy,
  });
  const paths = (await kubernetesDetector.scan({ root })).map((finding) => finding.location.path);
  assert.deepEqual(paths, ["chart/crds/crd.yaml", "chart/templates/job.yaml", "chart/values.yaml"]);
});

test("a file with template actions outside a chart is read as a template", async () => {
  const root = await repository({
    "templates/job.yaml": "apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: {{ .Release.Name }}\n",
    "templates/ingress.yaml": [
      '{{- if .Capabilities.APIVersions.Has "networking.k8s.io/v1" }}',
      "apiVersion: networking.k8s.io/v1",
      "{{- else }}",
      "apiVersion: networking.k8s.io/v1beta1",
      "{{- end }}",
      "kind: Ingress",
      "",
    ].join("\n"),
  });
  const findings = await kubernetesDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path]), [[CRONJOB, "templates/job.yaml"]]);
});

test("a kustomization patch target and inline patch are read, and the file's own API is not", async () => {
  const root = await repository({
    "kustomization.yaml": [
      "apiVersion: kustomize.config.k8s.io/v1beta1",
      "kind: Kustomization",
      "patches:",
      "  - patch: |-",
      "      apiVersion: batch/v1beta1",
      "      kind: CronJob",
      "",
    ].join("\n"),
  });
  const findings = await kubernetesDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location]), [[CRONJOB, { path: "kustomization.yaml", line: 5 }]]);
});

test("skips dependency and fixture directories and symbolic links, and finds nested files", async () => {
  const legacy = "apiVersion: batch/v1beta1\nkind: CronJob\n";
  const root = await repository({
    "deploy/prod/cron.yaml": legacy,
    "node_modules/pkg/cron.yaml": legacy,
    "vendor/pkg/cron.yaml": legacy,
    "tests/fixtures/old/cron.yaml": legacy,
    "testdata/cron.yaml": legacy,
  });
  await symlink(join(root, "deploy"), join(root, "linked")).catch(() => undefined);
  const findings = await kubernetesDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => finding.location.path), ["deploy/prod/cron.yaml"]);
});

test("files that are too large or too deep are skipped without failing", async () => {
  const legacy = "apiVersion: batch/v1beta1\nkind: CronJob\n";
  const root = await repository({
    "big.yaml": `# ${"x".repeat(1024 * 1024)}\n${legacy}`,
    "a/b/c/d/e/f/g/h/i/deep.yaml": legacy,
    "ok.yaml": legacy,
  });
  assert.deepEqual((await kubernetesDetector.scan({ root })).map((finding) => finding.location.path), ["ok.yaml"]);
});

test("a repository with no Kubernetes files scans to nothing without reading the registry", async () => {
  const root = await repository({ "README.md": "hello\n", "ci.yaml": "name: ci\non: push\n" });
  assert.deepEqual(await kubernetesDetector.analyze({ root }), { findings: [], unclassified: [] });
});

test("dynamic and cluster-dependent declarations are never reported", async () => {
  const root = await repository({
    "chart/Chart.yaml": "apiVersion: v2\nname: chart\nversion: 0.1.0\n",
    "chart/templates/ingress.yaml": [
      '{{- if .Capabilities.APIVersions.Has "networking.k8s.io/v1" }}',
      "apiVersion: networking.k8s.io/v1",
      "{{- else }}",
      "apiVersion: networking.k8s.io/v1beta1",
      "{{- end }}",
      "kind: Ingress",
      "",
    ].join("\n"),
  });
  assert.deepEqual(await kubernetesDetector.scan({ root }), []);
});
