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
  assert.equal(manifest.license, "CC-BY-4.0");
  assert.deepEqual(manifest.files, ["registry", "schemas", "ATTRIBUTION.md"]);
  for (const key of ["main", "module", "types", "exports", "bin", "scripts", "dependencies", "devDependencies", "peerDependencies"]) {
    assert.equal(manifest[key], undefined, `data package must not declare ${key}`);
  }
});

test("the built manifest takes its version from the root package and its license from the dataset", async () => {
  const root = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string; license: string };
  const template = JSON.parse(await readFile(resolve(DATA_PACKAGE_DIRECTORY, "package.json"), "utf8")) as DataPackageJson;
  const manifest = dataPackageManifest(root, template);
  assert.equal(manifest.name, DATA_PACKAGE_NAME);
  assert.equal(manifest.version, root.version);
  assert.equal(root.license, "Apache-2.0");
  assert.equal(manifest.license, template.license);
  assert.notEqual(manifest.license, root.license);
  assert.deepEqual(manifest.files, ["registry", "schemas", "ATTRIBUTION.md"]);
  assert.equal(manifest.repository.directory, DATA_PACKAGE_DIRECTORY);
});

test("the assembled package has registry JSON, schemas, the license, and attribution, and omits the source lock and vendor schemas", async () => {
  const out = await stagingDirectory();
  const built = await buildDataPackage({ root: resolve("."), out });
  assert.equal(built.packageJson.name, DATA_PACKAGE_NAME);
  assert.ok(built.files.includes("package.json"));
  assert.ok(built.files.includes("LICENSE"));
  assert.ok(built.files.includes("ATTRIBUTION.md"));
  assert.ok(built.files.some((path) => path.startsWith("registry/") && path.endsWith(".json")));
  assert.ok(built.files.some((path) => path.startsWith("schemas/") && path.endsWith(".json")));
  assert.ok(built.files.includes("registry/npm.json"));
  assert.ok(built.files.includes("schemas/registry.v2.schema.json"));
  assert.ok(!built.files.includes("registry/sources.lock.json"));
  assert.ok(!built.files.some((path) => path.includes("vendor")));
  await access(join(out, "registry", "npm.json"));
  await access(join(out, "schemas", "registry.v2.schema.json"));
  assert.match(await readFile(join(out, "LICENSE"), "utf8"), /Creative Commons Attribution 4\.0 International/);
  assert.match(await readFile(join(out, "ATTRIBUTION.md"), "utf8"), /CC BY 4\.0/);
});

test("the packed tarball has no executable code, no nested manifests, and ships the license documents", async () => {
  const out = await stagingDirectory();
  const packDestination = await stagingDirectory();
  await buildDataPackage({ root: resolve("."), out });
  const files = await listPackedFiles(out);
  assert.deepEqual(tarballContentProblems(files), []);

  const filename = await packDataPackage(out, packDestination);
  assert.match(filename, new RegExp(`^${DATA_PACKAGE_NAME}-\\d+\\.\\d+\\.\\d+\\.tgz$`));
  await access(join(packDestination, filename));

  const documents = new Set(["LICENSE", "ATTRIBUTION.md"]);
  assert.equal(files.filter((file) => file.path === "package.json").length, 1);
  for (const name of documents) assert.ok(files.some((file) => file.path === name), `${name} must ship`);
  assert.ok(files.every((file) => file.path.endsWith(".json") || documents.has(file.path)));
  assert.ok(files.every((file) => (file.mode & 0o111) === 0));
  assert.ok(!files.some((file) => file.path !== "package.json" && /(^|\/)package\.json$/.test(file.path)));
});

test("tarballContentProblems names code files, nested manifests, vendor paths, and missing license documents", () => {
  assert.deepEqual(
    tarballContentProblems([
      { path: "LICENSE", size: 1, mode: 0o644 },
      { path: "ATTRIBUTION.md", size: 1, mode: 0o644 },
      { path: "package.json", size: 1, mode: 0o644 },
      { path: "registry/npm.json", size: 1, mode: 0o644 },
      { path: "schemas/registry.v2.schema.json", size: 1, mode: 0o644 },
    ]),
    [],
  );
  assert.deepEqual(
    tarballContentProblems([
      { path: "package.json", size: 1, mode: 0o644 },
      { path: "registry/npm.json", size: 1, mode: 0o644 },
      { path: "schemas/registry.v2.schema.json", size: 1, mode: 0o644 },
    ]),
    ["missing ATTRIBUTION.md", "missing LICENSE"],
  );
  assert.ok(
    tarballContentProblems([
      { path: "LICENSE", size: 1, mode: 0o644 },
      { path: "ATTRIBUTION.md", size: 1, mode: 0o644 },
      { path: "package.json", size: 1, mode: 0o644 },
      { path: "registry/run.js", size: 1, mode: 0o644 },
      { path: "schemas/nested/package.json", size: 1, mode: 0o644 },
      { path: "schemas/vendor/sarif.json", size: 1, mode: 0o755 },
    ]).some((problem) => /executable code|nested or misplaced|vendor path|executable mode/.test(problem)),
  );
});
