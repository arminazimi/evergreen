import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

// Decision 0027: a file whose name a dependency scanner recognizes is committed under a neutral name and
// restored in a temporary copy at run time. `tools/examples.ts` performs that copy for these directories.

const ROOTS = ["examples/gallery", "examples/drift", "examples/codemods", "examples/upgrade"];

const MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "composer.json",
  "composer.lock",
  "Gemfile",
  "Gemfile.lock",
  "go.mod",
  "go.sum",
  "go.work",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "build.sbt",
  "gradle.lockfile",
  "pubspec.yaml",
  "pubspec.lock",
  "mix.exs",
  "mix.lock",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  "requirements.txt",
  "uv.lock",
  "pdm.lock",
  "packages.lock.json",
  "Directory.Packages.props",
  "Package.swift",
  "Package.resolved",
  "Podfile",
  "Podfile.lock",
]);

function recognized(name: string): boolean {
  return (
    /dockerfile/iu.test(name) ||
    MANIFESTS.has(name) ||
    name.endsWith(".lock") ||
    name.endsWith(".lockb") ||
    /\.(csproj|fsproj|vbproj)$/u.test(name)
  );
}

test("no example commits a file a dependency scanner reads by name", async () => {
  const committed: string[] = [];
  for (const root of ROOTS) {
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && recognized(entry.name)) committed.push(join(entry.parentPath, entry.name));
    }
  }

  assert.deepEqual(committed.sort(), [], "store these under a neutral name; see decision 0027");
});
