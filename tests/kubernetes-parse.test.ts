import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { ruleVersion, splitApiVersion } from "../src/detectors/kubernetes/api-version.js";
import {
  MAXIMUM_DOCUMENTS,
  MAXIMUM_INPUT_BYTES,
  parseManifest,
} from "../src/detectors/kubernetes/parse-manifest.js";
import {
  MAXIMUM_ACTIONS,
  MAXIMUM_DOCUMENTS as MAXIMUM_TEMPLATE_DOCUMENTS,
  MAXIMUM_INPUT_BYTES as MAXIMUM_CHART_BYTES,
  MAXIMUM_LINE_LENGTH,
  MAXIMUM_NESTING,
  parseChart,
  parseTemplate,
} from "../src/detectors/kubernetes/parse-helm.js";
import {
  MAXIMUM_ENTRIES,
  MAXIMUM_INPUT_BYTES as MAXIMUM_KUSTOMIZATION_BYTES,
  MAXIMUM_PATCH_BYTES,
  parseKustomization,
} from "../src/detectors/kubernetes/parse-kustomize.js";

async function fixture(caseName: string, ...file: string[]): Promise<string> {
  return readFile(resolve("tests/fixtures/kubernetes", caseName, ...file), "utf8");
}

const summary = (contents: string) =>
  parseManifest(contents).map(({ value, resource, line, kindLine }) => ({ value, resource, line, kindLine }));

test("reads apiVersion and kind from every document of a multi-document file", async () => {
  assert.deepEqual(summary(await fixture("positive", "manifests", "web.yaml")), [
    { value: "extensions/v1beta1", resource: "Ingress", line: 2, kindLine: 3 },
    { value: "apps/v1", resource: "Deployment", line: 16, kindLine: 17 },
    { value: "batch/v1beta1", resource: "CronJob", line: 34, kindLine: 35 },
  ]);
});

test("reads kind before apiVersion and quoted values", async () => {
  assert.deepEqual(parseManifest(await fixture("positive", "manifests", "psp.yml")), [
    {
      kind: "api",
      value: "policy/v1beta1",
      group: "policy",
      version: "v1beta1",
      resource: "PodSecurityPolicy",
      line: 3,
      kindLine: 2,
    },
  ]);
});

test("splits the core group from a grouped apiVersion", () => {
  assert.deepEqual(parseManifest("apiVersion: v1\nkind: Namespace\n"), [
    { kind: "api", value: "v1", group: "", version: "v1", resource: "Namespace", line: 1, kindLine: 2 },
  ]);
});

test("ignores comments, nested keys, block scalars, aliases, and half declarations", async () => {
  // Only the three documents that are real, literal declarations are returned; the
  // alias document, the apiVersion-only and kind-only documents, and the List items are not.
  assert.deepEqual(summary(await fixture("negative", "manifests", "lookalikes.yaml")), [
    { value: "v1", resource: "ConfigMap", line: 3, kindLine: 4 },
    { value: "apiextensions.k8s.io/v1", resource: "CustomResourceDefinition", line: 32, kindLine: 33 },
    { value: "v1", resource: "List", line: 47, kindLine: 48 },
  ]);
});

test("reads a document that has an anchor but no alias", () => {
  assert.deepEqual(summary("x: &a 1\napiVersion: batch/v1beta1\nkind: CronJob\n"), [
    { value: "batch/v1beta1", resource: "CronJob", line: 2, kindLine: 3 },
  ]);
});

test("returns supported APIs too; the registry decides what is a finding", async () => {
  assert.deepEqual(summary(await fixture("zero", "manifests", "app.yaml")).map((entry) => entry.value), [
    "apps/v1",
    "networking.k8s.io/v1",
    "batch/v1",
  ]);
});

test("rejects non-literal and malformed values", () => {
  for (const contents of [
    "apiVersion: {{ .Values.api }}\nkind: Ingress\n",
    "apiVersion: extensions/v1beta1\nkind: {{ .Values.kind }}\n",
    "apiVersion: 1\nkind: Ingress\n",
    "apiVersion: |\n  extensions/v1beta1\nkind: Ingress\n",
    "apiVersion: [extensions/v1beta1]\nkind: Ingress\n",
    "apiVersion: Extensions/V1beta1\nkind: Ingress\n",
    "apiVersion: extensions/v1beta1/extra\nkind: Ingress\n",
    "apiVersion: extensions/v1beta1\nkind: Ing ress\n",
    "apiVersion: extensions/v1beta1\nkind: 7\n",
    "- apiVersion: extensions/v1beta1\n  kind: Ingress\n",
    "just text\n",
  ]) {
    assert.deepEqual(parseManifest(contents), [], contents);
  }
});

test("malformed input returns nothing and never throws", async () => {
  for (const file of ["broken.yaml", "tab.yaml", "nul-byte.yaml"]) {
    const malformed = await fixture("malformed", "manifests", file);
    assert.doesNotThrow(() => parseManifest(malformed));
    assert.deepEqual(parseManifest(malformed), [], file);
  }
  for (const junk of ["", "\u0000\u0001", "﻿", "---\n---\n", "%YAML 1.2\n---\n", "{", "[[[", "apiVersion", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseManifest(junk));
    assert.deepEqual(parseManifest(junk), []);
  }
  const deep = "[".repeat(200_000);
  assert.doesNotThrow(() => parseManifest(deep));
  assert.deepEqual(parseManifest(deep), []);
});

test("bounds input size and document count", () => {
  assert.deepEqual(parseManifest(`# ${"x".repeat(MAXIMUM_INPUT_BYTES)}\napiVersion: v1\nkind: Namespace\n`), []);
  const documents = (count: number) => Array(count).fill("apiVersion: v1\nkind: Namespace\n").join("---\n");
  assert.deepEqual(parseManifest(documents(MAXIMUM_DOCUMENTS + 1)), []);
  assert.equal(parseManifest(documents(MAXIMUM_DOCUMENTS)).length, MAXIMUM_DOCUMENTS);
});

test("handles CRLF, a byte order mark, and document markers with one-based lines", () => {
  assert.deepEqual(summary("﻿# c\r\n---\r\napiVersion: batch/v1beta1\r\nkind: CronJob\r\n"), [
    { value: "batch/v1beta1", resource: "CronJob", line: 3, kindLine: 4 },
  ]);
});

test("is deterministic", async () => {
  const contents = await fixture("positive", "manifests", "web.yaml");
  assert.deepEqual(parseManifest(contents), parseManifest(contents));
});

test("splits apiVersion values", () => {
  assert.deepEqual(splitApiVersion("extensions/v1beta1"), { group: "extensions", version: "v1beta1" });
  assert.deepEqual(splitApiVersion("flowcontrol.apiserver.k8s.io/v1beta3"), {
    group: "flowcontrol.apiserver.k8s.io",
    version: "v1beta3",
  });
  assert.deepEqual(splitApiVersion("v1"), { group: "", version: "v1" });
  for (const bad of ["", "/v1", "a/", "A/v1", "a/b/c", "{{ x }}", `${"a".repeat(300)}/v1`, "a b/v1"]) {
    assert.equal(splitApiVersion(bad), undefined, bad);
  }
});

test("translates API versions to the semver text used by rules", () => {
  assert.equal(ruleVersion("v1"), "1.0.0");
  assert.equal(ruleVersion("v2"), "2.0.0");
  assert.equal(ruleVersion("v1beta1"), "1.0.0-beta.1");
  assert.equal(ruleVersion("v2beta2"), "2.0.0-beta.2");
  assert.equal(ruleVersion("v1alpha1"), "1.0.0-alpha.1");
  for (const bad of ["", "1", "v0", "v01", "v1beta", "v1beta0", "v1gamma1", "V1", "v1beta1x", "latest"]) {
    assert.equal(ruleVersion(bad), undefined, bad);
  }
});

// Helm charts

const template = (contents: string) =>
  parseTemplate(contents).map(({ value, resource, line, kindLine }) => ({ value, resource, line, kindLine }));

test("reads a top-level kubeVersion from Chart.yaml", async () => {
  assert.deepEqual(parseChart(await fixture("positive", "helm", "mychart", "Chart.yaml")), [
    { kind: "kubeVersion", value: ">=1.19.0-0 <1.22.0-0", line: 6 },
  ]);
  assert.deepEqual(parseChart(await fixture("zero", "helm", "mychart", "Chart.yaml")), []);
});

test("ignores a commented or nested kubeVersion and the chart's own apiVersion", async () => {
  assert.deepEqual(parseChart(await fixture("negative", "helm", "mychart", "Chart.yaml")), []);
  for (const contents of ["kubeVersion: 1\n", "kubeVersion: {{ .x }}\n", "kubeVersion: ''\n", "- kubeVersion: '>=1'\n", "kubeVersion: [a]\n"]) {
    assert.deepEqual(parseChart(contents), [], contents);
  }
});

test("malformed or oversized Chart.yaml returns nothing", async () => {
  const malformed = await fixture("malformed", "helm", "mychart", "Chart.yaml");
  assert.doesNotThrow(() => parseChart(malformed));
  assert.deepEqual(parseChart(malformed), []);
  assert.deepEqual(parseChart(`# ${"x".repeat(MAXIMUM_CHART_BYTES)}\nkubeVersion: ">=1.0.0"\n`), []);
  assert.deepEqual(parseChart(`kubeVersion: "${">=1.0.0 ".repeat(100)}"\n`), []);
  for (const junk of ["", "\u0000", "{", "[[["]) assert.deepEqual(parseChart(junk), []);
});

test("reads literal declarations from templates, including inside a .Values condition", async () => {
  assert.deepEqual(template(await fixture("positive", "helm", "mychart", "templates", "ingress.yaml")), [
    { value: "networking.k8s.io/v1beta1", resource: "Ingress", line: 2, kindLine: 3 },
  ]);
  assert.deepEqual(template(await fixture("positive", "helm", "mychart", "templates", "cronjob.yml")), [
    { value: "batch/v1beta1", resource: "CronJob", line: 1, kindLine: 2 },
  ]);
  assert.deepEqual(template(await fixture("zero", "helm", "mychart", "templates", "deployment.yaml")), [
    { value: "apps/v1", resource: "Deployment", line: 1, kindLine: 2 },
  ]);
});

test("drops declarations inside a capability ladder and dynamic values", async () => {
  assert.deepEqual(parseTemplate(await fixture("negative", "helm", "mychart", "templates", "ingress.yaml")), []);
  assert.deepEqual(parseTemplate(await fixture("negative", "helm", "mychart", "templates", "dynamic.yaml")), []);
  assert.deepEqual(parseTemplate(await fixture("negative", "helm", "mychart", "templates", "_helpers.tpl")), []);
});

test("treats include, template, tpl, lookup, and define bodies as dynamic", () => {
  const legacy = "apiVersion: extensions/v1beta1\nkind: Ingress\n";
  for (const guard of [
    '{{- if include "x.stable" . }}',
    '{{- if eq (include "x.api" .) "v1" }}',
    "{{- if tpl .Values.cond . }}",
    '{{- if lookup "v1" "Namespace" "" "x" }}',
    '{{- if semverCompare ">=1.19-0" .Capabilities.KubeVersion.GitVersion }}',
    '{{- define "x.legacy" }}',
    '{{- block "x" . }}',
    '{{- with .Capabilities }}',
    '{{- range .Capabilities.APIVersions }}',
  ]) {
    assert.deepEqual(parseTemplate(`${guard}\n${legacy}{{- end }}\n`), [], guard);
  }
});

test("a later branch of a chain is dynamic once any earlier condition asked the cluster", () => {
  const source = [
    "{{- if .Values.a }}",
    "apiVersion: batch/v1beta1",
    "kind: CronJob",
    "{{- else if .Capabilities.APIVersions.Has \"batch/v1\" }}",
    "apiVersion: batch/v1",
    "kind: CronJob",
    "{{- else }}",
    "apiVersion: batch/v1beta1",
    "kind: CronJob",
    "{{- end }}",
  ].join("\n");
  // The first branch is an ordinary value condition: one apiVersion and one kind line there is a pair,
  // but the document also has dynamic lines, so the document is dropped rather than guessed.
  assert.deepEqual(parseTemplate(source), []);
  // Separate documents keep their own state; the block closes before the second one.
  const separate = [
    "{{- if .Capabilities.APIVersions.Has \"x\" }}",
    "apiVersion: batch/v1beta1",
    "kind: CronJob",
    "{{- end }}",
    "---",
    "apiVersion: policy/v1beta1",
    "kind: PodDisruptionBudget",
  ].join("\n");
  assert.deepEqual(template(separate), [
    { value: "policy/v1beta1", resource: "PodDisruptionBudget", line: 6, kindLine: 7 },
  ]);
});

test("reads several documents and counts every line, including multi-line actions", () => {
  const source = [
    "{{- /*",
    "  a comment that spans lines",
    "*/ -}}",
    "apiVersion: batch/v1beta1 # legacy",
    "kind: CronJob",
    "metadata:",
    "  name: {{ include \"x\" . |",
    "    quote }}",
    "---",
    'apiVersion: "policy/v1beta1"',
    "kind: 'PodSecurityPolicy'",
  ].join("\n");
  assert.deepEqual(template(source), [
    { value: "batch/v1beta1", resource: "CronJob", line: 4, kindLine: 5 },
    { value: "policy/v1beta1", resource: "PodSecurityPolicy", line: 10, kindLine: 11 },
  ]);
});

test("skips documents with a duplicated key, indented keys, or half declarations", () => {
  for (const contents of [
    "apiVersion: batch/v1beta1\napiVersion: batch/v1\nkind: CronJob\n",
    "apiVersion: batch/v1beta1\nkind: CronJob\nkind: Job\n",
    "  apiVersion: batch/v1beta1\n  kind: CronJob\n",
    "apiVersion: batch/v1beta1\n",
    "kind: CronJob\n",
    "apiVersion: |\nkind: CronJob\n",
    "apiVersion: *x\nkind: CronJob\n",
    "apiVersion: batch/v1beta1\nkind: Cron Job\n",
  ]) {
    assert.deepEqual(parseTemplate(contents), [], contents);
  }
});

test("malformed templates return nothing and never throw", async () => {
  const malformed = await fixture("malformed", "helm", "mychart", "templates", "cronjob.yaml");
  assert.doesNotThrow(() => parseTemplate(malformed));
  assert.deepEqual(parseTemplate(malformed), []);
  for (const junk of [
    "",
    "\u0000\u0001",
    "{{",
    "{{ end }}",
    "{{ if .x }}apiVersion: batch/v1beta1\nkind: CronJob\n",
    '{{ "unterminated }}',
    "{{/* unterminated",
    "{{/* c */ x }}",
    "}}{{",
    "\r\n\r\n",
  ]) {
    assert.doesNotThrow(() => parseTemplate(junk));
    assert.deepEqual(parseTemplate(junk), [], JSON.stringify(junk));
  }
});

test("bounds template size, line length, actions, nesting, and documents", () => {
  const pair = "apiVersion: batch/v1beta1\nkind: CronJob\n";
  assert.deepEqual(parseTemplate(`# ${"x".repeat(MAXIMUM_CHART_BYTES)}\n${pair}`), []);
  assert.deepEqual(template(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n${pair}`), [
    { value: "batch/v1beta1", resource: "CronJob", line: 2, kindLine: 3 },
  ]);
  assert.deepEqual(parseTemplate(`apiVersion: ${"a".repeat(MAXIMUM_LINE_LENGTH)}\nkind: CronJob\n`), []);
  assert.deepEqual(parseTemplate(`${"{{ x }}".repeat(MAXIMUM_ACTIONS + 1)}\n${pair}`), []);
  assert.deepEqual(parseTemplate(`${"{{ if .x }}".repeat(MAXIMUM_NESTING + 1)}\n${pair}${"{{ end }}".repeat(MAXIMUM_NESTING + 1)}`), []);
  assert.equal(parseTemplate(`${"{{ if .x }}".repeat(MAXIMUM_NESTING)}\n${pair}${"{{ end }}".repeat(MAXIMUM_NESTING)}`).length, 1);
  const documents = (count: number) => Array(count).fill(pair).join("---\n");
  assert.deepEqual(parseTemplate(documents(MAXIMUM_TEMPLATE_DOCUMENTS + 1)), []);
  assert.equal(parseTemplate(documents(MAXIMUM_TEMPLATE_DOCUMENTS)).length, MAXIMUM_TEMPLATE_DOCUMENTS);
});

test("handles CRLF and is deterministic", async () => {
  assert.deepEqual(template("{{- if .Values.x }}\r\napiVersion: batch/v1beta1\r\nkind: CronJob\r\n{{- end }}\r\n"), [
    { value: "batch/v1beta1", resource: "CronJob", line: 2, kindLine: 3 },
  ]);
  const contents = await fixture("positive", "helm", "mychart", "templates", "ingress.yaml");
  assert.deepEqual(parseTemplate(contents), parseTemplate(contents));
});

// kustomization.yaml

const kustomization = (contents: string) =>
  parseKustomization(contents).map((entry) =>
    entry.kind === "resource"
      ? { kind: entry.kind, value: entry.value, line: entry.line }
      : { kind: entry.kind, value: entry.value, resource: entry.resource, line: entry.line, kindLine: entry.kindLine },
  );

test("reads local resources, a patch target, and an inline patch with mapped lines", async () => {
  assert.deepEqual(kustomization(await fixture("positive", "kustomize", "kustomization.yaml")), [
    { kind: "resource", value: "ingress.yaml", line: 5 },
    { kind: "resource", value: "../base", line: 6 },
    { kind: "api", value: "batch/v1beta1", resource: "CronJob", line: 10, kindLine: 11 },
    { kind: "api", value: "policy/v1beta1", resource: "PodDisruptionBudget", line: 18, kindLine: 19 },
  ]);
  assert.deepEqual(kustomization(await fixture("zero", "kustomize", "kustomization.yaml")), [
    { kind: "resource", value: "deployment.yaml", line: 4 },
  ]);
});

test("does not read the file's own API, remote or variable resources, or lookalike keys", async () => {
  assert.deepEqual(kustomization(await fixture("negative", "kustomize", "kustomization.yaml")), []);
});

test("reads a core-group target, legacy patchesJson6902, and patchesStrategicMerge", () => {
  const source = [
    "resources:",
    "  - a.yaml",
    "patchesJson6902:",
    "  - target:",
    "      version: v1",
    "      kind: Namespace",
    "    path: ns.json",
    "patchesStrategicMerge:",
    "  - patch.yaml",
    "  - |-",
    "    apiVersion: extensions/v1beta1",
    "    kind: Ingress",
  ].join("\n");
  assert.deepEqual(kustomization(source), [
    { kind: "resource", value: "a.yaml", line: 2 },
    { kind: "api", value: "v1", resource: "Namespace", line: 5, kindLine: 6 },
    { kind: "api", value: "extensions/v1beta1", resource: "Ingress", line: 11, kindLine: 12 },
  ]);
});

test("needs a literal group, version, and kind in a target and a block-scalar inline patch", () => {
  for (const contents of [
    "patches:\n  - target:\n      group: batch\n      kind: CronJob\n",
    "patches:\n  - target:\n      group: batch\n      version: v1beta1\n",
    "patches:\n  - target:\n      group: batch\n      version: $(V)\n      kind: CronJob\n",
    "patches:\n  - target:\n      group: Batch\n      version: v1beta1\n      kind: CronJob\n",
    "patches:\n  - patch: 'apiVersion: batch/v1beta1'\n",
    "patches:\n  - patch: >-\n      apiVersion: batch/v1beta1\n      kind: CronJob\n",
    "patches:\n  - patch: |-\n      - op: add\n        path: /a\n        value: b\n",
    "patches:\n  - patch: |-\n      apiVersion: batch/v1beta1\n",
    "patches:\n  - patch: |-\n      apiVersion: [batch\n      kind: CronJob\n",
    "patches: not-a-list\n",
    "patches:\n  - just a string\n",
  ]) {
    assert.deepEqual(parseKustomization(contents), [], contents);
  }
});

test("rejects paths that are not local", () => {
  for (const path of [
    "https://example.test/base",
    "ssh://git@example.test/repo.git",
    "git@github.com:org/repo.git",
    "github.com/org/repo//base?ref=v1",
    "example.test/org/repo",
    "$(BASE)/a.yaml",
    "/etc/passwd",
    "a\\b.yaml",
    "",
  ]) {
    assert.deepEqual(parseKustomization(`resources:\n  - "${path.replace(/\\/g, "\\\\")}"\n`), [], path);
  }
  assert.deepEqual(kustomization("resources:\n  - ./base.d/a.yaml\n  - ../../shared\n"), [
    { kind: "resource", value: "./base.d/a.yaml", line: 2 },
    { kind: "resource", value: "../../shared", line: 3 },
  ]);
});

test("a file that is some other kind of object, or that uses an alias, yields nothing", () => {
  assert.deepEqual(parseKustomization("kind: Deployment\nresources:\n  - a.yaml\n"), []);
  assert.deepEqual(parseKustomization("x: &a b.yaml\nresources:\n  - *a\n"), []);
  assert.deepEqual(kustomization("kind: Component\nresources:\n  - a.yaml\n"), [{ kind: "resource", value: "a.yaml", line: 3 }]);
});

test("malformed or oversized kustomization yields nothing and never throws", async () => {
  const malformed = await fixture("malformed", "kustomize", "kustomization.yaml");
  assert.doesNotThrow(() => parseKustomization(malformed));
  assert.deepEqual(parseKustomization(malformed), []);
  for (const junk of ["", "\u0000", "{", "[[[", "resources: [", "- a\n- b\n"]) {
    assert.deepEqual(parseKustomization(junk), [], JSON.stringify(junk));
  }
  assert.deepEqual(parseKustomization(`# ${"x".repeat(MAXIMUM_KUSTOMIZATION_BYTES)}\nresources:\n  - a.yaml\n`), []);
  const tooMany = `resources:\n${"  - a.yaml\n".repeat(MAXIMUM_ENTRIES + 1)}`;
  assert.deepEqual(parseKustomization(tooMany), []);
  const body = `apiVersion: batch/v1beta1\nkind: CronJob\n# ${"x".repeat(MAXIMUM_PATCH_BYTES)}\n`;
  const patch = `patches:\n  - patch: |-\n${body.replace(/^/gm, "      ")}`;
  assert.deepEqual(parseKustomization(patch), []);
});

test("kustomization parsing is deterministic and uses one-based lines", async () => {
  const contents = await fixture("positive", "kustomize", "kustomization.yaml");
  assert.deepEqual(parseKustomization(contents), parseKustomization(contents));
  assert.deepEqual(kustomization("\r\nresources:\r\n  - a.yaml\r\n"), [{ kind: "resource", value: "a.yaml", line: 3 }]);
});
