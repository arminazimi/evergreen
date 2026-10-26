import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import {
  KUBERNETES_DEPRECATION_GUIDE_URL,
  RELEASE_ANNOUNCEMENTS,
  kubernetesDeprecationGuideImporter,
} from "../../tools/importers/kubernetes-1.js";
import { execute, runImporter } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/kubernetes-1.json");

async function registry(): Promise<RegistryV2> {
  return JSON.parse(await readFile(resolve("registry/kubernetes.json"), "utf8")) as RegistryV2;
}

test("drafts a removed rule for every API version the recorded guide says is no longer served", async () => {
  const drafts = await execute(kubernetesDeprecationGuideImporter, { replay: recording });
  assert.equal(drafts.rules.length, 50);
  assert.deepEqual(drafts.notes, []);
  assert.ok(drafts.rules.every((rule) => rule.event === "removed" && rule.severity === "high"));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "kubernetes-1" && rule.provenance.observedAt === "2026-10-17"));
  assert.ok(drafts.rules.every((rule) => rule.sources[0]?.url === KUBERNETES_DEPRECATION_GUIDE_URL));
});

test("reads sentences that list several versions and several kinds", async () => {
  const drafts = await execute(kubernetesDeprecationGuideImporter, { replay: recording });
  const byId = new Map(drafts.rules.map((rule) => [rule.id, rule]));
  // "The extensions/v1beta1, apps/v1beta1, and apps/v1beta2 API versions of Deployment ... v1.16"
  for (const id of ["extensions.deployment.v1beta1", "apps.deployment.v1beta1", "apps.deployment.v1beta2"]) {
    assert.equal(byId.get(`kubernetes.${id}.removed`)?.deadline, "2019-09-18", id);
  }
  // "The extensions/v1beta1 and networking.k8s.io/v1beta1 API versions of Ingress ... v1.22"
  assert.equal(byId.get("kubernetes.extensions.ingress.v1beta1.removed")?.purl, "pkg:generic/kubernetes/extensions/Ingress");
  assert.equal(byId.get("kubernetes.networking-k8s-io.ingress.v1beta1.removed")?.purl, "pkg:generic/kubernetes/networking.k8s.io/Ingress");
  // "... CSIDriver, CSINode, StorageClass, and VolumeAttachment ... v1.22": four kinds, one version
  for (const kind of ["csidriver", "csinode", "storageclass", "volumeattachment"]) {
    assert.ok(byId.has(`kubernetes.storage-k8s-io.${kind}.v1beta1.removed`), kind);
  }
  // "PodSecurityPolicy in the policy/v1beta1 API version is no longer served as of v1.25"
  assert.equal(byId.get("kubernetes.policy.podsecuritypolicy.v1beta1.removed")?.deadline, "2022-08-23");
  // "flowcontrol ... v1beta2 ... v1, available since v1.29, or ... v1beta3": the first replacement is used.
  assert.equal(
    byId.get("kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta2.removed")?.replacement,
    "flowcontrol.apiserver.k8s.io/v1 FlowSchema, available since v1.29",
  );
});

test("recorded drafts match the reviewed rules", async () => {
  const drafts = await execute(kubernetesDeprecationGuideImporter, { replay: recording });
  const reviewed = await registry();
  // Helm repository rules are curated by hand; the guide importer only drafts API removals.
  const apiRules = {
    ...reviewed,
    rules: reviewed.rules.filter((rule) => rule.purl.startsWith("pkg:generic/kubernetes/")),
  };
  const diff = diffDrafts(drafts, apiRules);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.unchanged, apiRules.rules.map((rule) => rule.id).sort());
  assert.equal(diff.added.length, 0);
});

test("each release announcement row is dated like its URL", () => {
  for (const [release, row] of Object.entries(RELEASE_ANNOUNCEMENTS)) {
    const [, year, month, day] = /\/blog\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(row.url)!;
    assert.equal(row.date, `${year}-${month}-${day}`, release);
    assert.ok(row.url.startsWith("https://kubernetes.io/blog/"), release);
  }
});

function guide(body: string) {
  return runImporter(kubernetesDeprecationGuideImporter, {
    now: new Date("2026-10-17T12:00:00Z"),
    async fetchText(url, options) {
      assert.equal(url, KUBERNETES_DEPRECATION_GUIDE_URL);
      assert.equal(options?.accept, "text/html");
      return body;
    },
  });
}

test("a release with no verified date is drafted without a deadline and named in the notes", async () => {
  const result = await guide(
    "<p>The autoscaling/v2beta1 API version of HorizontalPodAutoscaler is no longer served as of v1.99. " +
      "Migrate manifests and API clients to use the autoscaling/v2 API version, available since v1.23.</p>",
  );
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0]!.deadline, undefined);
  assert.equal(result.rules[0]!.sources.length, 1);
  assert.match(result.rules[0]!.summary, /no longer served as of v1\.99\.$/);
  assert.deepEqual(result.notes, [
    "No verified release date for v1.99; those rules have no deadline until a row is added to RELEASE_ANNOUNCEMENTS.",
  ]);
});

test("a statement it cannot read is counted in the notes, not guessed", async () => {
  const result = await guide(
    "<p>The batch/v1beta1 API version of CronJob is no longer served as of v1.25.</p>" +
      "<p>Something unusual is no longer served as of v1.30.</p>",
  );
  assert.deepEqual(result.rules.map((rule) => rule.id), ["kubernetes.batch.cronjob.v1beta1.removed"]);
  assert.deepEqual(result.notes, ["1 removal statements do not match a known sentence form and were not drafted."]);
});

test("a page with no removal statements produces a review note, not rules", async () => {
  const result = await guide("<h1>Deprecated API Migration Guide</h1><p>Nothing is listed.</p>");
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No removal statements were found in the migration guide."]);
});
