import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";

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

export function scannerRecognizesFixtureName(name: string): boolean {
  return (
    /dockerfile/iu.test(name) ||
    MANIFESTS.has(name) ||
    name.endsWith(".lock") ||
    name.endsWith(".lockb") ||
    /\.(csproj|fsproj|vbproj)$/u.test(name)
  );
}

/**
 * The real name of a committed fixture file. Names a dependency scanner recognizes are stored with a `.fixture`
 * suffix; the `image` segment stands for `Dockerfile`, because Scorecard matches that word anywhere in a name
 * (decision 0027). A name without the suffix is returned unchanged.
 */
export function fixtureRealName(storedName: string): string {
  if (!storedName.endsWith(".fixture")) return storedName;
  const segments = storedName.slice(0, -".fixture".length).split(".");
  const image = segments.indexOf("image");
  if (image !== -1) segments[image] = "Dockerfile";
  const realName = segments.join(".");
  return scannerRecognizesFixtureName(realName) ? realName : storedName;
}

/** Restores every stored fixture name beneath `directory` in place. */
export async function restoreFixtureNames(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await restoreFixtureNames(path);
    else if (entry.isFile()) {
      const realName = fixtureRealName(entry.name);
      if (realName !== entry.name) await rename(path, join(directory, realName));
    }
  }
}
