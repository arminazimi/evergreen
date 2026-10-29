import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import {
  DATA_PACKAGE_DIRECTORY,
  DATA_PACKAGE_NAME,
  buildDataPackage,
  dataPackageManifest,
  listPackedFiles,
  packDataPackage,
  tarballContentProblems,
} from "../tools/build-data-package.js";
import type { DataPackageJson } from "../tools/build-data-package.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function stagingDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-data-package-"));
  temporaryRoots.push(directory);
  return directory;
}

test("the committed package.json is data-only metadata with no entry points or dependencies", async () => {
  const manifest = JSON.parse(await readFile(resolve(DATA_PACKAGE_DIRECTORY, "package.json"), "utf8")) as Record<string, unknown>;
  assert.equal(manifest.name, DATA_PACKAGE_NAME);
  assert.deepEqual(manifest.files, ["registry", "schemas"]);
  for (const key of ["main", "module", "types", "exports", "bin", "scripts", "dependencies", "devDependencies", "peerDependencies"]) {
    assert.equal(manifest[key], undefined, `data package must not declare ${key}`);
  }
});

test("the built manifest takes its version from the root package and keeps the data-only shape", async () => {
  const root = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string; license: string };
  const template = JSON.parse(await readFile(resolve(DATA_PACKAGE_DIRECTORY, "package.json"), "utf8")) as DataPackageJson;
  const manifest = dataPackageManifest(root, template);
  assert.equal(manifest.name, DATA_PACKAGE_NAME);
  assert.equal(manifest.version, root.version);
  assert.equal(manifest.license, root.license);
  assert.deepEqual(manifest.files, ["registry", "schemas"]);
  assert.equal(manifest.repository.directory, DATA_PACKAGE_DIRECTORY);
});

test("the assembled package has registry JSON and schemas, and omits the source lock and vendor schemas", async () => {
  const out = await stagingDirectory();
  const built = await buildDataPackage({ root: resolve("."), out });
  assert.equal(built.packageJson.name, DATA_PACKAGE_NAME);
  assert.ok(built.files.includes("package.json"));
  assert.ok(built.files.some((path) => path.startsWith("registry/") && path.endsWith(".json")));
  assert.ok(built.files.some((path) => path.startsWith("schemas/") && path.endsWith(".json")));
  assert.ok(built.files.includes("registry/npm.json"));
  assert.ok(built.files.includes("schemas/registry.v2.schema.json"));
  assert.ok(!built.files.includes("registry/sources.lock.json"));
  assert.ok(!built.files.some((path) => path.includes("vendor")));
  await access(join(out, "registry", "npm.json"));
  await access(join(out, "schemas", "registry.v2.schema.json"));
});

test("the packed tarball has no executable code and no nested manifests", async () => {
  const out = await stagingDirectory();
  const packDestination = await stagingDirectory();
  await buildDataPackage({ root: resolve("."), out });
  const files = await listPackedFiles(out);
  assert.deepEqual(tarballContentProblems(files), []);

  const filename = await packDataPackage(out, packDestination);
  assert.match(filename, new RegExp(`^${DATA_PACKAGE_NAME}-\\d+\\.\\d+\\.\\d+\\.tgz$`));
  await access(join(packDestination, filename));

  assert.equal(files.filter((file) => file.path === "package.json").length, 1);
  assert.ok(files.every((file) => file.path.endsWith(".json")));
  assert.ok(files.every((file) => (file.mode & 0o111) === 0));
  assert.ok(!files.some((file) => file.path !== "package.json" && /(^|\/)package\.json$/.test(file.path)));
});

test("tarballContentProblems names code files, nested manifests, and vendor paths", () => {
  assert.deepEqual(
    tarballContentProblems([
      { path: "package.json", size: 1, mode: 0o644 },
      { path: "registry/npm.json", size: 1, mode: 0o644 },
      { path: "schemas/registry.v2.schema.json", size: 1, mode: 0o644 },
    ]),
    [],
  );
  assert.ok(
    tarballContentProblems([
      { path: "package.json", size: 1, mode: 0o644 },
      { path: "registry/run.js", size: 1, mode: 0o644 },
      { path: "schemas/nested/package.json", size: 1, mode: 0o644 },
      { path: "schemas/vendor/sarif.json", size: 1, mode: 0o755 },
    ]).some((problem) => /executable code|nested or misplaced|vendor path|executable mode/.test(problem)),
  );
});
