import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  "working-directory"?: string;
}
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
interface Workflow {
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const build = parse(await readFile(resolve(".github/workflows/release-build-binaries.yml"), "utf8")) as Workflow;
const publish = parse(await readFile(resolve(".github/workflows/release-publish-binaries.yml"), "utf8")) as Workflow;
const binary = build.jobs.binary!;
const release = publish.jobs["binary-release"]!;
const provenance = publish.jobs.provenance!;
const releaseCommands = release.steps!.map((step) => step.run ?? "").join("\n");

test("a binary is built for every supported platform", async () => {
  // The matrix is selected with fromJSON(dry_run ? … : …); assert the full release list in source.
  const source = await readFile(resolve(".github/workflows/release-build-binaries.yml"), "utf8");
  for (const target of ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"]) {
    assert.match(source, new RegExp(`"target":"${target}"`));
  }
  assert.match(source, /fromJSON\(inputs\.dry_run/);
});

test("every binary is smoke-tested before it is uploaded", () => {
  const names = binary.steps!.map((step) => step.run ?? step.uses ?? "");
  const smoke = names.findIndex((text) => text.includes("smoke.mjs"));
  const upload = names.findIndex((text) => text.startsWith("actions/upload-artifact@"));
  assert.ok(smoke !== -1 && upload > smoke);
  assert.ok(
    binary.steps!.some((step) => step.run?.includes("PATH=/usr/bin:/bin")),
    "the Unix smoke test runs without Node.js on the path",
  );
});

test("the release job needs the builds and holds only the permissions it uses", () => {
  assert.deepEqual(release.permissions, { contents: "write", "id-token": "write", attestations: "write" });
  assert.deepEqual(publish.permissions, { contents: "read" });
  assert.ok(
    release.steps!.some((step) => step.run?.includes("sha256sum")),
    "checksums are written",
  );
  assert.ok(
    release.steps!.some((step) => step.uses?.startsWith("actions/attest-build-provenance@")),
    "provenance is attested",
  );
  assert.ok(
    release.outputs?.hashes?.includes("steps.release.outputs.hashes"),
    "hashes are exported for the SLSA generator",
  );
  assert.ok(
    release.outputs?.tag?.includes("steps.release.outputs.tag"),
    "the release tag is exported for the SLSA generator",
  );
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
  assert.match(releaseCommands, /gh release upload .*binaries\/SHA256SUMS\.sigstore\.json/s);

  assert.equal(
    release.env?.IDENTITY_PATTERN,
    String.raw`^https://github\.com/arminazimi/evergreen/\.github/workflows/release-publish-binaries\.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+(-.+)?$`,
  );
  assert.equal(release.env?.OIDC_ISSUER, "https://token.actions.githubusercontent.com");
  const identity = new RegExp(release.env!.IDENTITY_PATTERN!);
  const prefix = "https://github.com/arminazimi/evergreen/.github/workflows/release-publish-binaries.yml";
  assert.ok(identity.test(`${prefix}@refs/tags/v1.0.0`));
  assert.ok(identity.test(`${prefix}@refs/tags/v1.2.3-rc.1`));
  for (const rejected of [
    `${prefix}@refs/heads/main`,
    `${prefix}@refs/heads/feature`,
    `${prefix}@refs/tags/v1`,
    "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/tags/v1.0.0",
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/v1.0.0",
    "https://github.com/someone/evergreen/.github/workflows/release-publish-binaries.yml@refs/tags/v1.0.0",
    "https://github.com/arminazimi/other/.github/workflows/release-publish-binaries.yml@refs/tags/v1.0.0",
  ])
    assert.equal(identity.test(rejected), false, rejected);
});

test("every release asset is uploaded exactly once", () => {
  const line = releaseCommands.split("\n").find((command) => command.includes("gh release upload"));
  assert.ok(line, "the release job uploads assets");
  const paths = line
    .match(/gh release upload "\$TAG" (.+) --clobber/)![1]!
    .trim()
    .split(/\s+/);
  const assets = [
    "binaries/evergreen-1.2.3-darwin-arm64",
    "binaries/evergreen-1.2.3-darwin-arm64.sigstore.json",
    "binaries/evergreen-1.2.3-linux-x64",
    "binaries/evergreen-1.2.3-linux-x64.sigstore.json",
    "binaries/evergreen-1.2.3-win32-x64.exe",
    "binaries/evergreen-1.2.3-win32-x64.exe.sigstore.json",
    "binaries/SHA256SUMS",
    "binaries/SHA256SUMS.sigstore.json",
  ];
  const uploaded = paths.flatMap((glob) => expandGlob(glob, assets));
  assert.deepEqual([...uploaded].sort(), [...assets].sort(), "every produced asset reaches the release");
  assert.equal(
    new Set(uploaded).size,
    uploaded.length,
    "no asset is passed twice: gh uploads in parallel, so the duplicate fails with HTTP 422",
  );
});

function expandGlob(pattern: string, files: string[]): string[] {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${source}$`);
  return files.filter((file) => regex.test(file));
}

test("IDENTITY_PATTERN matches the verify-blob regexp documented in RELEASING.md", async () => {
  const docs = await readFile(resolve("docs/RELEASING.md"), "utf8");
  const match = docs.match(/--certificate-identity-regexp '([^']+)'/);
  assert.ok(match?.[1], "RELEASING.md documents a certificate-identity-regexp");
  assert.equal(
    match[1],
    release.env?.IDENTITY_PATTERN,
    "docs/RELEASING.md and release-publish-binaries.yml must use the same identity regexp",
  );
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
