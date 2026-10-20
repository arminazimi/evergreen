import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { FETCH_MARKER, isCheckoutUsable, resolveFetchStrategy, sparseFingerprint, sparsePatterns } from "../benchmarks/corpus-fetch.js";
import { declaresInput } from "../src/detector-inputs.js";
import { builtInDetectors } from "../src/detectors/index.js";

const run = promisify(execFile);

test("sparse patterns spell names case-insensitively, add extensions with a wildcard, and end directories with a slash", () => {
  const patterns = sparsePatterns([{ fileNames: ["Go.mod"], extensions: [".csproj"], sourceExtensions: [".ts"], directories: [".github/workflows"] }]);
  assert.deepEqual(patterns, ["*.[cC][sS][pP][rR][oO][jJ]", "*.[tT][sS]", ".github/workflows/", "[gG][oO].[mM][oO][dD]"]);
});

test("a sparse checkout built from the declarations keeps exactly the files the detectors may read", async () => {
  const files = [
    "package.json", "sub/Package.JSON", "src/app.ts", "src/app.test.tsx", ".github/workflows/ci.yml", "deep/.github/workflows/x.yml",
    "src/Program.cs", "App/App.csproj", "Dockerfile", "docker/api.Dockerfile", "requirements-dev.txt",
    "README.md", "assets/logo.png", "docs/guide.md", "notes.txt", "LICENSE",
  ];
  const root = await mkdtemp(join(tmpdir(), "evergreen-sparse-"));
  try {
    const git = (...args: string[]) => run("git", ["-C", root, ...args]);
    await run("git", ["init", "--quiet", root]);
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "t");
    for (const file of files) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), "x");
    }
    await git("add", "-A");
    await git("commit", "--quiet", "-m", "tree");
    await git("config", "core.sparseCheckout", "true");
    await git("config", "core.sparseCheckoutCone", "false");
    await writeFile(join(root, ".git", "info", "sparse-checkout"), `${sparsePatterns().join("\n")}\n`);
    await git("read-tree", "-mu", "HEAD");
    const present = new Set((await run("git", ["-C", root, "ls-files", "-t"])).stdout.split("\n").filter((line) => line.startsWith("H ")).map((line) => line.slice(2)));
    const declared = (path: string) => builtInDetectors.some((detector) => detector.inputs && declaresInput(detector.inputs, path));
    for (const file of files) assert.equal(present.has(file), declared(file), `${file}: sparse checkout and declarations disagree`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a complete checkout serves every strategy; a sparse one only the declarations it was built from", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-usable-"));
  try {
    assert.equal(await isCheckoutUsable(root, "sparse"), true, "no marker means complete");
    assert.equal(await isCheckoutUsable(root, "shallow"), true);
    await writeFile(join(root, FETCH_MARKER), `${sparseFingerprint()}\n`);
    assert.equal(await isCheckoutUsable(root, "sparse"), true);
    assert.equal(await isCheckoutUsable(root, "shallow"), false, "a full run needs a full checkout");
    await writeFile(join(root, FETCH_MARKER), "sparse:0000000000000000\n");
    assert.equal(await isCheckoutUsable(root, "sparse"), false, "the declarations changed since it was fetched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the fingerprint changes when the declared inputs change", () => {
  assert.notEqual(sparseFingerprint(["a"]), sparseFingerprint(["a", "b"]));
  assert.equal(sparseFingerprint(["a"]), sparseFingerprint(["a"]));
});

test("the fetch strategy defaults to sparse and rejects unknown values", () => {
  assert.equal(resolveFetchStrategy({}), "sparse");
  assert.equal(resolveFetchStrategy({ EVERGREEN_CORPUS_FETCH: "shallow" }), "shallow");
  assert.throws(() => resolveFetchStrategy({ EVERGREEN_CORPUS_FETCH: "tarball" }), /use sparse or shallow/);
});
