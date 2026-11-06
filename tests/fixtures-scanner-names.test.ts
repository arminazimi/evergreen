import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import { fixtureRealName, scannerRecognizesFixtureName } from "../src/fixture-names.js";
import { copyFixtureTree } from "./fixture-copies.js";

test("no tracked fixture has a name dependency scanners recognize", () => {
  const paths = execFileSync("git", ["ls-files", "-z", "--", "tests/fixtures/", "tests/gitlab/fixtures/"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const recognized = paths.filter((path) => scannerRecognizesFixtureName(basename(path)));
  assert.deepEqual(recognized, [], "store these under neutral names; see decision 0027");
});

test("the shared name rule rejects manifests, lockfiles, project files, and every Dockerfile spelling", () => {
  for (const name of [
    "package.json",
    "Gemfile",
    "Cargo.toml",
    "go.work",
    "requirements.txt",
    "custom.lock",
    "bun.lockb",
    "App.csproj",
    "Library.fsproj",
    "Win.vbproj",
    "Dockerfile",
    "before.dOcKeRfIlE.fixture",
  ]) {
    assert.equal(scannerRecognizesFixtureName(name), true, name);
  }
  for (const name of ["package.json.fixture", "image.fixture", "Gemfile.lock.fixture", "README.md", "app.ts"]) {
    assert.equal(scannerRecognizesFixtureName(name), false, name);
  }
  assert.equal(fixtureRealName("package.json.fixture"), "package.json");
  assert.equal(fixtureRealName("api.image.fixture"), "api.Dockerfile");
  assert.equal(fixtureRealName("notes.txt.fixture"), "notes.txt.fixture");
  assert.equal(fixtureRealName("app.ts"), "app.ts");
});

test("copying restores recognized names recursively and leaves the stored tree intact", async () => {
  const source = await mkdtemp(join(tmpdir(), "evergreen-stored-fixture-"));
  const roots = [source];
  try {
    await mkdir(join(source, "nested"));
    await writeFile(join(source, "nested/package.json.fixture"), '{"private":true}');
    await writeFile(join(source, "image.prod.fixture"), "FROM scratch\n");
    await writeFile(join(source, "notes.txt.fixture"), "ordinary data");
    const copy = await copyFixtureTree(source, roots);
    assert.equal(await readFile(join(copy, "nested/package.json"), "utf8"), '{"private":true}');
    assert.equal(await readFile(join(copy, "Dockerfile.prod"), "utf8"), "FROM scratch\n");
    assert.equal(await readFile(join(copy, "notes.txt.fixture"), "utf8"), "ordinary data");
    assert.equal(await readFile(join(source, "nested/package.json.fixture"), "utf8"), '{"private":true}');
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});
