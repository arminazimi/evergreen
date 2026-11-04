import { test } from "node:test";

import { checkDetectorRoundTrip, TEST_TIMEOUT_MS, type DetectorRoundTripCase } from "./harness.js";

/**
 * Property tests for the package-manifest detectors: npm and Python.
 *
 * A detector reads a directory rather than a string, so a case names the file the registry writes and
 * the seeds around it, and the property is what a scan says about a project that declares one
 * registry-known package at one version: the finding names the package, the version it resolved, and
 * the file it read. Two packages are known in these registries with a wildcard range — `request` for
 * npm, `argparse` for Python — so a case generates within those names; any version of them is judged,
 * which is what makes the version a generated value rather than a fixture.
 *
 * Findings report values inside a sentence written for a human, so the harness matches the markers as
 * text rather than as whole fields.
 */

/** The root manifest npm needs before it reads a lockfile at all. */
const npmSeed = ({ name, version }: { name: string; version: string }) => ({
  "package.json": JSON.stringify({ name: "fuzz-target", private: true, dependencies: { [name]: version } }),
});

/** The declaration the Python detector matches a lockfile against. */
const pythonSeed = ({ name, version }: { name: string; version: string }) => ({
  "pyproject.toml": `[project]\nname = "fuzz-target"\ndependencies = ["${name}==${version}"]\n`,
});

const CASES: readonly DetectorRoundTripCase[] = [
  // A workspace package declares the dependency; no lockfile resolves it, and the finding says so.
  {
    name: "npm package.json (workspace)",
    file: ({ name, version }) => JSON.stringify({ name: "app", dependencies: { [name]: version } }),
    names: "request",
    versions: "9.8.7|2.88.0",
    markers: ({ name, version }) => [name, version, "packages/app/package.json"],
  },
  {
    name: "npm package-lock.json",
    file: ({ name, version }) =>
      `{"name":"fuzz-target","lockfileVersion":3,"packages":{"":{"dependencies":{"${name}":"${version}"}},"node_modules/${name}":{"version":"${version}"}}}\n`,
    names: "request",
    versions: "9.8.7|2.88.0",
    seed: npmSeed,
  },
  {
    name: "npm npm-shrinkwrap.json",
    file: ({ name, version }) =>
      `{"name":"fuzz-target","lockfileVersion":3,"dependencies":{"${name}":{"version":"${version}"}}}\n`,
    names: "request",
    versions: "9.8.7|2.88.0",
    seed: npmSeed,
  },
  {
    name: "npm pnpm-lock.yaml",
    file: ({ name, version }) =>
      `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      ${name}:\n        specifier: ${version}\n        version: ${version}\n\npackages:\n\n  ${name}@${version}:\n    resolution: {integrity: sha512-${version}}\n    engines: {node: '>=6'}\n`,
    names: "request",
    versions: "9.8.7|2.88.0",
    seed: npmSeed,
  },
  {
    name: "npm yarn.lock",
    file: ({ name, version }) =>
      `# yarn lockfile v1\n\n${name}@${version}:\n  version "${version}"\n  resolved "https://registry.yarnpkg.com/${name}/-/${name}-${version}.tgz"\n`,
    names: "request",
    versions: "9.8.7|2.88.0",
    seed: npmSeed,
  },
  {
    name: "npm bun.lock",
    file: ({ name, version }) =>
      `{"lockfileVersion":1,"workspaces":{"":{"dependencies":{"${name}":"${version}"}}},"packages":[["${name}@${version}",{"name":"${name}","version":"${version}","dependencies":{}},["${name}@${version}"]]]}\n`,
    names: "request",
    versions: "9.8.7|2.88.0",
    seed: npmSeed,
  },

  {
    name: "python pyproject.toml",
    file: ({ name, version }) => `[project]\nname = "fuzz-target"\ndependencies = ["${name}==${version}"]\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    markers: ({ name, version }) => [name, version, "pyproject.toml"],
  },
  {
    name: "python requirements.txt",
    file: ({ name, version }) => `${name}==${version}\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    seed: pythonSeed,
  },
  {
    name: "python uv.lock",
    file: ({ name, version }) =>
      `version = 1\n\n[[package]]\nname = "${name}"\nversion = "${version}"\nsource = { registry = "https://pypi.org/simple" }\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    seed: pythonSeed,
  },
  {
    name: "python poetry.lock",
    file: ({ name, version }) =>
      `[[package]]\nname = "${name}"\nversion = "${version}"\ndescription = "property test target"\n\n[metadata]\nlock-version = "2.0"\npython-versions = "^3.12"\ncontent-hash = "zzmark"\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    seed: pythonSeed,
  },
  {
    name: "python pdm.lock",
    file: ({ name, version }) => `# pdm.lock\n\n[[package]]\nname = "${name}"\nversion = "${version}"\nfiles = []\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    seed: pythonSeed,
  },
  {
    name: "python Pipfile.lock",
    file: ({ name, version }) => `{"default":{"${name}":{"version":"==${version}"}},"develop":{}}\n`,
    names: "argparse",
    versions: "9.8.7|1.4.0",
    seed: pythonSeed,
  },
];

for (const target of CASES) {
  test(`${target.name} reports what a canonical project declares`, { timeout: TEST_TIMEOUT_MS }, async () => {
    await checkDetectorRoundTrip(target);
  });
}
