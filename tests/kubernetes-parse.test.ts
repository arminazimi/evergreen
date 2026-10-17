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
