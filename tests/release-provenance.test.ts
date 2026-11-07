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
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: Step[];
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: Record<string, string>;
  outputs?: Record<string, string>;
  if?: string;
}
interface Workflow {
  jobs: Record<string, Job>;
}

const container = parse(await readFile(resolve(".github/workflows/release-publish-container.yml"), "utf8")) as Workflow;
const binaries = parse(await readFile(resolve(".github/workflows/release-publish-binaries.yml"), "utf8")) as Workflow;
const publish = parse(await readFile(resolve(".github/workflows/publish.yml"), "utf8")) as Workflow;
const verifier = parse(await readFile(resolve(".github/actions/slsa-verifier/action.yml"), "utf8")) as {
  runs: { steps: Array<{ env?: Record<string, string>; run?: string }> };
};

const containerGenerator =
  "slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0";
const genericGenerator = "slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0";

function commands(job: Job | undefined): string {
  assert.ok(job, "the job exists");
  return (job.steps ?? []).map((step) => step.run ?? "").join("\n");
}

test("the container image gets SLSA Build L3 provenance from the isolated generator", () => {
  const image = container.jobs.container!;
  assert.match(image.outputs?.image ?? "", /steps\.release\.outputs\.image/);
  assert.match(image.outputs?.digest ?? "", /steps\.image\.outputs\.digest/);

  const provenance = container.jobs.provenance!;
  assert.equal(provenance.needs, "container");
  assert.deepEqual(provenance.permissions, { actions: "read", "id-token": "write", packages: "write" });
  assert.equal(provenance.uses, containerGenerator);
  assert.equal(provenance.with?.image, "${{ needs.container.outputs.image }}");
  assert.equal(provenance.with?.digest, "${{ needs.container.outputs.digest }}");
  assert.equal(provenance.with?.["registry-username"], "${{ github.actor }}");
  assert.equal(provenance.secrets?.["registry-password"], "${{ secrets.GITHUB_TOKEN }}");

  const verify = container.jobs.verify!;
  assert.deepEqual(verify.needs, ["container", "provenance"]);
  assert.deepEqual(verify.permissions, { contents: "read", packages: "read" });
  assert.ok(verify.steps?.some((step) => step.uses === "$/.github/actions/slsa-verifier"));
  const run = commands(verify);
  assert.match(run, /slsa-verifier verify-image "\$IMAGE@\$DIGEST"/);
  assert.match(run, /--source-uri "github\.com\/\$\{\{ github\.repository \}\}"/);
  assert.match(run, /--source-tag "\$TAG"/);
  const verifyStep = verify.steps?.find((step) => step.name === "Verify the image provenance");
  assert.equal(verifyStep?.env?.TAG, "${{ github.ref_name }}");
  assert.match(
    run,
    /--builder-id "https:\/\/github\.com\/slsa-framework\/slsa-github-generator\/\.github\/workflows\/generator_container_slsa3\.yml@refs\/tags\/v2\.1\.0"/,
  );
});

test("the binary stage verifies the provenance it uploaded", () => {
  const verify = binaries.jobs.verify!;
  assert.deepEqual(verify.needs, ["binary-release", "provenance"]);
  assert.deepEqual(verify.permissions, { contents: "read" });
  assert.ok(verify.steps?.some((step) => step.uses === "$/.github/actions/slsa-verifier"));

  const run = commands(verify);
  assert.match(run, /gh release download "\$TAG" --pattern 'multiple\.intoto\.jsonl'/);
  assert.match(run, /gh release download "\$TAG" --pattern 'evergreen-\*'/);
  assert.match(run, /find release -name '\*\.sigstore\.json' -delete/);
  assert.match(run, /slsa-verifier verify-artifact release\/evergreen-\*/);
  assert.match(run, /--provenance-path release\/multiple\.intoto\.jsonl/);
  assert.match(run, /--source-uri "github\.com\/\$\{\{ github\.repository \}\}"/);
  assert.match(run, /--source-tag "\$TAG"/);
  assert.match(
    run,
    /--builder-id "https:\/\/github\.com\/slsa-framework\/slsa-github-generator\/\.github\/workflows\/generator_generic_slsa3\.yml@refs\/tags\/v2\.1\.0"/,
  );
});

test("the npm publish verifies the registry attestation", () => {
  const verify = publish.jobs["verify-provenance"]!;
  assert.equal(verify.needs, "smoke");
  assert.match(verify.if ?? "", /!inputs\.dry_run/);
  assert.ok(verify.steps?.some((step) => step.uses === "$/.github/actions/slsa-verifier"));

  const run = commands(verify);
  assert.match(run, /SLSA_VERIFIER_EXPERIMENTAL=1 slsa-verifier verify-npm-package package\.tgz/);
  assert.match(run, /--attestations-path attestations\.json/);
  assert.match(run, /--builder-id "https:\/\/github\.com\/actions\/runner\/github-hosted"/);
  assert.match(run, /--package-name evergreen-deprecation/);
  assert.match(run, /--package-version "\$version"/);
  assert.match(run, /--source-uri "github\.com\/\$\{\{ github\.repository \}\}"/);
  assert.match(run, /has no npm provenance attestation/);
});

test("the slsa-verifier install is pinned and checked against its release checksum", () => {
  const install = verifier.runs.steps[0]!;
  assert.equal(install.env?.SLSA_VERIFIER_VERSION, "v2.7.1");
  assert.match(install.env?.SLSA_VERIFIER_SHA256 ?? "", /^[0-9a-f]{64}$/);
  assert.match(install.run ?? "", /slsa-verifier-linux-amd64/);
  assert.match(install.run ?? "", /sha256sum --check -/);
  assert.match(install.run ?? "", /sudo install -m 0755 .* \/usr\/local\/bin\/slsa-verifier/);
  assert.doesNotMatch(install.run ?? "", /GITHUB_PATH/);
});

test("a dry run generates and verifies no provenance", () => {
  for (const job of [
    container.jobs.provenance,
    container.jobs.verify,
    binaries.jobs.provenance,
    binaries.jobs.verify,
  ]) {
    assert.match(job?.if ?? "", /!inputs\.dry_run/);
  }
});

test("each verifier expects the builder that produced the provenance", () => {
  assert.equal(binaries.jobs.provenance!.uses, genericGenerator);
  assert.equal(container.jobs.provenance!.uses, containerGenerator);
  assert.match(commands(binaries.jobs.verify), /generator_generic_slsa3\.yml@refs\/tags\/v2\.1\.0/);
  assert.match(commands(container.jobs.verify), /generator_container_slsa3\.yml@refs\/tags\/v2\.1\.0/);
});
