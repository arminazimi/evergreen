import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { ruleVersion, splitApiVersion } from "../src/detectors/kubernetes/api-version.js";
import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/kubernetes.json", "utf8"))).rules;
}

const GUIDE = "https://kubernetes.io/docs/reference/using-api/deprecation-guide/";

test("kubernetes registry has five valid removal rules with the migration guide and a release announcement", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.match(rule.purl, /^pkg:generic\/kubernetes\/[a-z0-9.-]+\/[A-Za-z0-9]+$/);
    assert.equal(rule.event, "removed");
    assert.ok(rule.sources.some((source) => source.url === GUIDE), `${rule.id} does not cite the migration guide`);
    assert.ok(
      rule.sources.some((source) => /^https:\/\/kubernetes\.io\/blog\/\d{4}\/\d{2}\/\d{2}\//.test(source.url)),
      `${rule.id} does not cite a release announcement`,
    );
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://kubernetes.io/")), `${rule.id} cites a non-official source`);
  }
});

test("each deadline is the date in the cited release announcement's URL", async () => {
  for (const rule of await rules()) {
    const announcement = rule.sources.find((source) => source.url.includes("/blog/"))!;
    const [, year, month, day] = /\/blog\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(announcement.url)!;
    assert.equal(rule.deadline, `${year}-${month}-${day}`, rule.id);
  }
});

test("a rule matches exactly its own API version, translated to semver", async () => {
  const all = await rules();
  const byId = new Map(all.map((rule) => [rule.id, rule.vers]));
  const cases: Array<[string, string, boolean]> = [
    ["kubernetes.extensions.ingress.v1beta1.removed", "v1beta1", true],
    ["kubernetes.extensions.ingress.v1beta1.removed", "v1", false],
    ["kubernetes.networking-k8s-io.ingress.v1beta1.removed", "v1beta1", true],
    ["kubernetes.networking-k8s-io.ingress.v1beta1.removed", "v1", false],
    ["kubernetes.batch.cronjob.v1beta1.removed", "v1beta1", true],
    ["kubernetes.batch.cronjob.v1beta1.removed", "v1", false],
    ["kubernetes.policy.podsecuritypolicy.v1beta1.removed", "v1beta1", true],
    ["kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed", "v2beta2", true],
    ["kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed", "v2beta1", false],
    ["kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed", "v2", false],
  ];
  for (const [id, version, affected] of cases) {
    assert.equal(versContains(byId.get(id)!, ruleVersion(version)!), affected, `${id} ${version}`);
  }
});

test("rule ids and PURLs agree with the group and kind they name", async () => {
  for (const rule of await rules()) {
    const [, group, kind] = /^pkg:generic\/kubernetes\/(.+)\/([^/]+)$/.exec(rule.purl)!;
    assert.ok(splitApiVersion(`${group}/v1`), rule.id);
    assert.ok(rule.id.startsWith(`kubernetes.${group!.replace(/\./g, "-")}.${kind!.toLowerCase()}.`), rule.id);
  }
});
