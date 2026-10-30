import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

interface Step { name?: string; uses?: string; run?: string; if?: string; "working-directory"?: string }
interface Job {
  needs?: string | string[];
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  strategy?: { matrix: { include: Array<{ target: string }> } };
  steps?: Step[];
  uses?: string;
  with?: Record<string, unknown>;
  outputs?: Record<string, string>;
}
interface Workflow { permissions?: Record<string, string>; jobs: Record<string, Job> }

const workflow = parse(await readFile(resolve(".github/workflows/release.yml"), "utf8")) as Workflow;
const binary = workflow.jobs.binary!;
const release = workflow.jobs["binary-release"]!;
const provenance = workflow.jobs.provenance!;
const releaseCommands = release.steps!.map((step) => step.run ?? "").join("\n");

test("a binary is built for every supported platform", () => {
  assert.deepEqual(binary.strategy?.matrix.include.map((entry) => entry.target).sort(), ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"]);
});

test("every binary is smoke-tested before it is uploaded", () => {
  const names = binary.steps!.map((step) => step.run ?? step.uses ?? "");
  const smoke = names.findIndex((text) => text.includes("smoke.mjs"));
  const upload = names.findIndex((text) => text.startsWith("actions/upload-artifact@"));
  assert.ok(smoke !== -1 && upload > smoke);
  assert.ok(binary.steps!.some((step) => step.run?.includes("PATH=/usr/bin:/bin")), "the Unix smoke test runs without Node.js on the path");
});

test("the release job needs the builds and holds only the permissions it uses", () => {
  assert.equal(release.needs, "binary");
  assert.deepEqual(release.permissions, { contents: "write", "id-token": "write", attestations: "write" });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(release.steps!.some((step) => step.run?.includes("sha256sum")), "checksums are written");
  assert.ok(release.steps!.some((step) => step.uses?.startsWith("actions/attest-build-provenance@")), "provenance is attested");
  assert.ok(release.outputs?.hashes?.includes("steps.release.outputs.hashes"), "hashes are exported for the SLSA generator");
  assert.ok(release.outputs?.tag?.includes("steps.release.outputs.tag"), "the release tag is exported for the SLSA generator");
});

test("binaries and checksums are signed keylessly with cosign and verified before upload", () => {
  const cosign = release.steps!.find((step) => step.uses?.startsWith("sigstore/cosign-installer@"));
  assert.ok(cosign, "cosign-installer is installed");
  assert.match(cosign.uses!, /^sigstore\/cosign-installer@[0-9a-f]{40}$/);
  assert.equal(cosign.uses, "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6");

  const signIndex = release.steps!.findIndex((step) => step.run?.includes("cosign sign-blob"));
  const verifyIndex = release.steps!.findIndex((step) => step.run?.includes("cosign verify-blob"));
  const uploadIndex = release.steps!.findIndex((step) => step.run?.includes("gh release upload"));
  assert.ok(signIndex >= 0 && verifyIndex > signIndex && uploadIndex > verifyIndex, "sign, then verify, then upload");
  assert.match(release.steps![signIndex]!.run!, /--yes --bundle "\$\{file\}\.sigstore\.json"/);
  assert.doesNotMatch(releaseCommands, /--key\b|COSIGN_PRIVATE_KEY|COSIGN_PASSWORD/, "no long-lived keys");
  assert.match(release.steps![verifyIndex]!.run!, /--certificate-oidc-issuer "\$\{OIDC_ISSUER\}"/);
  assert.match(release.steps![verifyIndex]!.run!, /--certificate-identity-regexp "\$\{IDENTITY_PATTERN\}"/);
  assert.match(releaseCommands, /gh release upload .*binaries\/\*\.sigstore\.json/s);

  assert.equal(
    release.env?.IDENTITY_PATTERN,
    String.raw`^https://github\.com/arminazimi/evergreen/\.github/workflows/release\.yml@refs/heads/main$`,
  );
  assert.equal(release.env?.OIDC_ISSUER, "https://token.actions.githubusercontent.com");
  const identity = new RegExp(release.env!.IDENTITY_PATTERN!);
  const prefix = "https://github.com/arminazimi/evergreen/.github/workflows/release.yml";
  assert.ok(identity.test(`${prefix}@refs/heads/main`));
  for (const rejected of [
    `${prefix}@refs/heads/feature`,
    `${prefix}@refs/tags/v1.0.0`,
    "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/heads/main",
    "https://github.com/someone/evergreen/.github/workflows/release.yml@refs/heads/main",
  ]) assert.equal(identity.test(rejected), false, rejected);
});

test("the SLSA generator attaches .intoto.jsonl provenance to the release", () => {
  assert.equal(provenance.needs, "binary-release");
  assert.deepEqual(provenance.permissions, { actions: "read", "id-token": "write", contents: "write" });
  assert.equal(
    provenance.uses,
    "slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0",
  );
  assert.equal(provenance.with?.["base64-subjects"], "${{ needs.binary-release.outputs.hashes }}");
  assert.equal(provenance.with?.["upload-assets"], true);
  assert.equal(provenance.with?.["upload-tag-name"], "${{ needs.binary-release.outputs.tag }}");
  assert.equal(provenance.with?.["provenance-name"], "multiple.intoto.jsonl");
});

test("actions are pinned to exact commits", () => {
  for (const step of [...binary.steps!, ...release.steps!].filter((item) => item.uses)) {
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
});
