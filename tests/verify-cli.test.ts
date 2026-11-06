import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { installedPackageRoot, RELEASE_MANIFEST_PATH, writeReleaseManifest } from "../src/release-manifest.js";
import { verifyInstalledRelease } from "../src/verify-release.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function packageRoot(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-verify-"));
  roots.push(root);
  const all = {
    "package.json": `${JSON.stringify({ name: "evergreen-deprecation", version: "9.9.9" })}\n`,
    "dist/src/cli.js": "#!/usr/bin/env node\n",
    ...files,
  };
  for (const [path, contents] of Object.entries(all)) {
    const full = join(root, ...path.split("/"));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents);
  }
  await writeReleaseManifest(root, ["package.json", "dist/src/cli.js"]);
  return root;
}

test("verify checks an installation against its release manifest and names what it could not check", async () => {
  const root = await packageRoot();
  const run = await runCli(["verify", root], { cwd: root });
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /Evergreen release verification/);
  assert.match(run.stdout, /Install: evergreen-deprecation@9\.9\.9/);
  assert.match(run.stdout, /Files: 2 files verified against dist\/src\/release-manifest\.json/);
  assert.match(run.stdout, /Signature: not checked/);
  assert.match(run.stdout, /Could not check offline/);
  assert.match(run.stdout, /npm audit signatures/);
  assert.match(run.stdout, /Result: all 2 files match the release manifest/);
});

test("verify fails when an installed file was changed", async () => {
  const root = await packageRoot();
  await writeFile(join(root, "dist", "src", "cli.js"), "#!/usr/bin/env noDe\n");
  const run = await runCli(["verify", root], { cwd: root });
  assert.equal(run.code, 1);
  assert.match(run.stdout, /Problem: dist\/src\/cli\.js does not match its SHA-256/);
  assert.match(run.stdout, /Result: verification failed with 1 problem/);
});

test("verify reports an installation with no manifest instead of failing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-verify-nomanifest-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{"name":"evergreen-deprecation","version":"0.0.1"}\n');
  const run = await runCli(["verify", root], { cwd: root });
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /Files: not checked/);
  assert.match(run.stdout, /nothing could be verified offline/);
});

test("verify rejects extra paths, unknown flags, and a directory that is not a package", async () => {
  const root = await packageRoot();
  for (const argv of [
    ["verify", root, root],
    ["verify", root, "--json"],
    ["verify", root, "--frobnicate"],
  ]) {
    const run = await runCli(argv, { cwd: root });
    assert.equal(run.code, 2, argv.join(" "));
    assert.match(run.stderr, /verify/);
  }

  const missing = await mkdtemp(join(tmpdir(), "evergreen-verify-empty-"));
  roots.push(missing);
  const run = await runCli(["verify", missing], { cwd: missing });
  assert.equal(run.code, 2);
  assert.match(run.stderr, /not an Evergreen package/);
});

test("the report names a signed data bundle and survives a data read failure", async () => {
  const root = await packageRoot();
  const signed = await verifyInstalledRelease(root, {
    dataStatus: async () => ({
      source: "cache",
      version: "2026.10.01",
      signer: { identity: "release.yml@refs/tags/v9.9.9", issuer: "https://token.actions.githubusercontent.com" },
    }),
  });
  assert.match(signed.data.note, /signed by release\.yml@refs\/tags\/v9\.9\.9/);

  const failed = await verifyInstalledRelease(root, {
    dataStatus: async () => {
      throw new Error("cache unreadable");
    },
  });
  assert.equal(failed.data.source, "unavailable");
  assert.match(failed.data.note, /cache unreadable/);
});

test("the default target is the package that is running", async () => {
  const root = installedPackageRoot();
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { name?: string };
  assert.equal(pkg.name, "evergreen-deprecation");
  assert.equal(RELEASE_MANIFEST_PATH, "dist/src/release-manifest.json");
});
