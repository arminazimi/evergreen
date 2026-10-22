import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

import { DATA_SIGNER } from "../src/data-bundle.js";

interface Step { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string> }
interface Workflow {
  on: { push?: { tags?: string[] }; workflow_dispatch?: { inputs?: Record<string, { default?: boolean; type?: string }> } };
  permissions?: Record<string, string>;
  jobs: Record<string, { permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] }>;
}

const path = ".github/workflows/data-release.yml";
const workflow = parse(await readFile(resolve(path), "utf8")) as Workflow;
const job = workflow.jobs.release!;
const commands = job.steps.map((step) => step.run ?? "").join("\n");

test("it releases on data tags, and a manual run is a dry run by default", () => {
  assert.deepEqual(workflow.on.push?.tags, ["data-v*"]);
  assert.equal(workflow.on.workflow_dispatch?.inputs?.dry_run?.default, true);
  assert.equal(workflow.on.workflow_dispatch?.inputs?.dry_run?.type, "boolean");
  const publish = job.steps.find((step) => step.run?.includes("gh release create"));
  assert.ok(publish, "a publish step exists");
  assert.equal(publish.if, "github.ref_type == 'tag'", "only a tag publishes");
});

test("permissions are read-only except in the release job, which needs only contents and the OIDC token", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(job.permissions, { contents: "write", "id-token": "write" });
});

test("third-party actions are pinned to exact versions", () => {
  for (const step of job.steps.filter((item) => item.uses)) {
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
  assert.ok(job.steps.some((step) => step.uses?.startsWith("sigstore/cosign-installer@")));
});

test("the bundle is built twice, compared, and dated by the commit, not the clock", () => {
  assert.match(commands, /for run in a b/);
  assert.match(commands, /cmp out\/a\.json out\/b\.json/);
  assert.match(commands, /git log -1 --format=%cd --date=format-local/);
  assert.doesNotMatch(commands, /\bdate\b\s+-u|\$\(date/);
  assert.match(commands, /does not match the bundle version/);
  assert.match(commands, /npm run check|npm ci/);
});

test("the bundle is signed keylessly and verified against the signer identity before anything is published", () => {
  const signIndex = job.steps.findIndex((step) => step.run?.includes("cosign sign-blob"));
  const verifyIndex = job.steps.findIndex((step) => step.run?.includes("cosign verify-blob"));
  const publishIndex = job.steps.findIndex((step) => step.run?.includes("gh release create"));
  assert.ok(signIndex >= 0 && verifyIndex > signIndex && publishIndex > verifyIndex, "sign, then verify, then publish");
  assert.match(job.steps[signIndex]!.run!, /--yes --bundle "\$\{BUNDLE\}\.sigstore\.json"/);
  assert.doesNotMatch(commands, /--key\b|COSIGN_PRIVATE_KEY|COSIGN_PASSWORD/, "no long-lived keys");
  const verify = job.steps[verifyIndex]!.run!;
  assert.match(verify, /--certificate-oidc-issuer "\$\{OIDC_ISSUER\}"/);
  assert.match(verify, /--certificate-identity-regexp "\$\{IDENTITY_PATTERN\}"/);
});

test("the workflow and the verifier agree on who may sign", () => {
  assert.equal(job.env?.IDENTITY_PATTERN, DATA_SIGNER.identityPattern);
  assert.equal(job.env?.OIDC_ISSUER, DATA_SIGNER.issuer);
  const identity = new RegExp(DATA_SIGNER.identityPattern);
  const prefix = "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml";
  for (const accepted of [`${prefix}@refs/tags/data-v2026.10.16`, `${prefix}@refs/tags/data-v2026.10.16.2`, `${prefix}@refs/heads/main`]) assert.ok(identity.test(accepted), accepted);
  for (const rejected of [
    "https://github.com/arminazimi/evergreen/.github/workflows/ci.yml@refs/heads/main",
    "https://github.com/someone/evergreen/.github/workflows/data-release.yml@refs/heads/main",
    "https://github.com/arminazimi/evergreen-fork/.github/workflows/data-release.yml@refs/heads/main",
    `${prefix}@refs/heads/feature`,
    `${prefix}@refs/tags/v1.0.0`,
    `${prefix}@refs/tags/data-v2026.10.16-evil`,
    `${prefix}@refs/pull/12/merge`,
    `x${prefix}@refs/heads/main`,
  ]) assert.equal(identity.test(rejected), false, rejected);
  assert.ok(path.endsWith("data-release.yml"));
});

test("it publishes the bundle, its signature, and checksums", () => {
  assert.match(commands, /sha256sum evergreen-data-\*\.json evergreen-data-\*\.sigstore\.json > SHA256SUMS/);
  assert.match(commands, /gh release create .* out\/\*/s);
  assert.match(commands, /--latest=false/, "a data bundle must never become the repository's Latest release");
  assert.match(commands, /--verify-tag/);
});
