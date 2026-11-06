import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  buildReleaseManifest,
  parseReleaseManifest,
  RELEASE_MANIFEST_PATH,
  RELEASE_SIGNATURE_PATH,
  RELEASE_SIGNER,
  ReleaseManifestError,
  verifyReleaseManifest,
  verifyReleaseSignature,
  writeReleaseManifest,
} from "../src/release-manifest.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function packageRoot(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-manifest-"));
  roots.push(root);
  const all = {
    "package.json": `${JSON.stringify({ name: "evergreen-deprecation", version: "9.9.9" })}\n`,
    "dist/src/cli.js": "#!/usr/bin/env node\n",
    "registry/npm.json": '{"rules":[]}\n',
    ...files,
  };
  for (const [path, contents] of Object.entries(all)) {
    const full = join(root, ...path.split("/"));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents);
  }
  return root;
}

const LISTED = ["package.json", "dist/src/cli.js", "registry/npm.json"];

test("a manifest built from the packed file list verifies, and leaves itself out", async () => {
  const root = await packageRoot();
  const manifest = await buildReleaseManifest(root, [...LISTED, RELEASE_MANIFEST_PATH, RELEASE_SIGNATURE_PATH]);
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    ["dist/src/cli.js", "package.json", "registry/npm.json"],
  );
  await writeReleaseManifest(root, LISTED);

  const verified = await verifyReleaseManifest(root);
  assert.ok(verified);
  assert.deepEqual(verified.problems, []);
  assert.equal(verified.manifest.name, "evergreen-deprecation");
  assert.equal(verified.manifest.version, "9.9.9");
  assert.match(await readFile(join(root, ...RELEASE_MANIFEST_PATH.split("/")), "utf8"), /"files": \[/);
});

test("the manifest bytes are deterministic: the same files give the same text", async () => {
  const root = await packageRoot();
  const target = await writeReleaseManifest(root, [...LISTED].reverse());
  const first = await readFile(target, "utf8");
  await writeReleaseManifest(root, LISTED);
  assert.equal(await readFile(target, "utf8"), first);
});

test("a changed file, a resized file, and a missing file are all reported", async () => {
  const root = await packageRoot();
  await writeReleaseManifest(root, LISTED);

  await writeFile(join(root, "registry", "npm.json"), '{"rules":[0}\n');
  let verified = await verifyReleaseManifest(root);
  assert.ok(verified);
  assert.match(verified.problems.join("\n"), /registry\/npm\.json does not match its SHA-256/);

  await writeFile(join(root, "dist", "src", "cli.js"), "tampered\n");
  verified = await verifyReleaseManifest(root);
  assert.ok(verified);
  assert.match(verified.problems.join("\n"), /dist\/src\/cli\.js is 9 bytes; the manifest says 20\./);

  await rm(join(root, "package.json"));
  verified = await verifyReleaseManifest(root);
  assert.ok(verified);
  assert.match(verified.problems.join("\n"), /package\.json cannot be read/);
  assert.match(verified.problems.join("\n"), /package\.json is missing/);
});

test("a manifest for another version, an unsafe path, and a duplicate are problems", async () => {
  const root = await packageRoot();
  await writeReleaseManifest(root, LISTED);

  const manifestPath = join(root, ...RELEASE_MANIFEST_PATH.split("/"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    version: string;
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  manifest.version = "0.0.1";
  const first = manifest.files[0];
  assert.ok(first);
  manifest.files.push({ ...first });
  manifest.files.push({ path: "../outside", sha256: "a".repeat(64), bytes: 1 });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const verified = await verifyReleaseManifest(root);
  assert.ok(verified);
  const problems = verified.problems.join("\n");
  assert.match(problems, /package\.json says evergreen-deprecation@9\.9\.9, but the manifest was written for/);
  assert.match(problems, /is listed twice/);
  assert.match(problems, /\.\.\/outside is not a safe path/);
});

test("an unreadable or malformed manifest fails instead of passing silently", async () => {
  const root = await packageRoot();
  const manifestPath = join(root, ...RELEASE_MANIFEST_PATH.split("/"));
  await mkdir(dirname(manifestPath), { recursive: true });

  await writeFile(manifestPath, "not json");
  await assert.rejects(() => verifyReleaseManifest(root), ReleaseManifestError);

  await writeFile(manifestPath, JSON.stringify({ schemaVersion: "something-else" }));
  await assert.rejects(() => verifyReleaseManifest(root), /not evergreen\.release-manifest\.v1/);

  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "evergreen.release-manifest.v1",
      name: "evergreen-deprecation",
      version: "9.9.9",
      files: [],
    }),
  );
  await assert.rejects(() => verifyReleaseManifest(root), /lists no files/);

  assert.throws(() => parseReleaseManifest(JSON.stringify({ schemaVersion: "evergreen.release-manifest.v1" })), {
    name: "ReleaseManifestError",
  });
});

test("a package without a manifest is unverifiable rather than a failure", async () => {
  const root = await packageRoot();
  assert.equal(await verifyReleaseManifest(root), undefined);
  assert.deepEqual(await verifyReleaseSignature(root), { checked: false, problems: [] });
});

test("a signature bundle is verified when present, and a bad one fails", async () => {
  const root = await packageRoot();
  await writeReleaseManifest(root, LISTED);
  const signaturePath = join(root, ...RELEASE_SIGNATURE_PATH.split("/"));
  await writeFile(signaturePath, "bundle");

  const signed = await verifyReleaseSignature(root, () => ({
    identity: "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/v9.9.9",
    issuer: "https://token.actions.githubusercontent.com",
  }));
  assert.equal(signed.checked, true);
  assert.equal(signed.problems.length, 0);
  assert.match(signed.signer?.identity ?? "", /release\.yml@refs\/tags\/v9\.9\.9/);

  const rejected = await verifyReleaseSignature(root, () => {
    throw new Error("certificate does not match");
  });
  assert.equal(rejected.checked, true);
  assert.match(rejected.problems[0] ?? "", /did not verify: certificate does not match/);

  await rm(signaturePath);
  assert.equal((await verifyReleaseSignature(root)).checked, false);
});

test("the manifest signer policy accepts only this repository's release chain on a version tag", () => {
  const pattern = new RegExp(RELEASE_SIGNER.identityPattern);
  for (const identity of [
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/v1.2.3",
    "https://github.com/arminazimi/evergreen/.github/workflows/publish.yml@refs/tags/v1.2.3",
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/v1.2.3-rc.1",
  ]) {
    assert.equal(pattern.test(identity), true, identity);
  }
  for (const identity of [
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/heads/main",
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/data-v2026.10.01",
    "https://github.com/someone-else/evergreen/.github/workflows/release.yml@refs/tags/v1.2.3",
  ]) {
    assert.equal(pattern.test(identity), false, identity);
  }
  assert.equal(RELEASE_SIGNER.issuer, "https://token.actions.githubusercontent.com");
});

test("a malformed manifest entry is rejected instead of half-read", () => {
  const entries: unknown[] = [
    null,
    {},
    { path: 1, sha256: "a".repeat(64), bytes: 1 },
    { path: "a", sha256: "not-a-digest", bytes: 1 },
    { path: "a", sha256: "a".repeat(64), bytes: -1 },
    { path: "a", sha256: "a".repeat(64), bytes: 1.5 },
  ];
  for (const entry of entries) {
    const text = JSON.stringify({
      schemaVersion: "evergreen.release-manifest.v1",
      name: "evergreen-deprecation",
      version: "9.9.9",
      files: [entry],
    });
    assert.throws(() => parseReleaseManifest(text), ReleaseManifestError, JSON.stringify(entry));
  }
});

test("building a manifest refuses a path that leaves the package", async () => {
  const root = await packageRoot();
  await assert.rejects(() => buildReleaseManifest(root, ["../outside"]), /not a safe path/);
});

test("a manifest that lists a directory instead of a file is a problem", async () => {
  const root = await packageRoot();
  await writeReleaseManifest(root, LISTED);
  const manifestPath = join(root, ...RELEASE_MANIFEST_PATH.split("/"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  manifest.files.push({ path: "registry", sha256: "a".repeat(64), bytes: 1 });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.match((await verifyReleaseManifest(root))?.problems.join("\n") ?? "", /registry is missing/);
  assert.equal((await stat(join(root, "registry"))).isDirectory(), true);
});
