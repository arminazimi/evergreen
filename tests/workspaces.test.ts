import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { npmDetector } from "../src/detectors/npm.js";
import { pythonDetector } from "../src/detectors/python.js";
import { discoverNpmWorkspaces, discoverPythonWorkspaces, globToRegExp, usagesOwnedBy } from "../src/workspaces.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-workspaces-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const manifest = (extra: object) => JSON.stringify({ name: "x", ...extra }, null, 2);

test("globs: * stays in one segment, ** crosses segments, ? matches one character", () => {
  const matches = (pattern: string, path: string) => globToRegExp(pattern).test(path);
  assert.equal(matches("packages/*", "packages/a"), true);
  assert.equal(matches("packages/*", "packages/a/b"), false);
  assert.equal(matches("packages/**", "packages/a/b"), true);
  assert.equal(matches("**/pkg", "a/b/pkg"), true);
  assert.equal(matches("**/pkg", "pkg"), true);
  assert.equal(matches("apps/?", "apps/a"), true);
  assert.equal(matches("apps/?", "apps/ab"), false);
  assert.equal(matches("./packages/*/", "packages/a"), true);
  assert.equal(matches("a.b", "aXb"), false);
});

test("npm, Yarn object form, pnpm, and Lerna declarations all find their packages, with exclusions", async () => {
  const files = {
    "package.json": manifest({ workspaces: ["packages/*", "apps/**"] }),
    "packages/a/package.json": manifest({}),
    "packages/b/package.json": manifest({}),
    "packages/b/nested/package.json": manifest({}),
    "packages/empty/readme.md": "x",
    "apps/web/package.json": manifest({}),
    "apps/web/deep/tool/package.json": manifest({}),
    "node_modules/dep/package.json": manifest({}),
    "packages/node_modules/dep/package.json": manifest({}),
  };
  assert.deepEqual(await discoverNpmWorkspaces(await repository(files)), ["apps/web", "apps/web/deep/tool", "packages/a", "packages/b"]);

  const yarn = await repository({ ...files, "package.json": manifest({ workspaces: { packages: ["packages/*"] } }) });
  assert.deepEqual(await discoverNpmWorkspaces(yarn), ["packages/a", "packages/b"]);

  const pnpm = await repository({ ...files, "package.json": manifest({}), "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - '!packages/b'\n" });
  assert.deepEqual(await discoverNpmWorkspaces(pnpm), ["packages/a"]);

  const lerna = await repository({ ...files, "package.json": manifest({}), "lerna.json": JSON.stringify({ packages: ["packages/*"] }) });
  assert.deepEqual(await discoverNpmWorkspaces(lerna), ["packages/a", "packages/b"]);
});

test("no declaration, a malformed manifest, or malformed YAML finds nothing and does not throw", async () => {
  assert.deepEqual(await discoverNpmWorkspaces(await repository({ "package.json": manifest({}), "packages/a/package.json": manifest({}) })), []);
  assert.deepEqual(await discoverNpmWorkspaces(await repository({ "package.json": "{ not json", "packages/a/package.json": manifest({}) })), []);
  assert.deepEqual(await discoverNpmWorkspaces(await repository({ "pnpm-workspace.yaml": "packages: [unclosed", "packages/a/package.json": manifest({}) })), []);
  assert.deepEqual(await discoverNpmWorkspaces(await repository({ "package.json": manifest({ workspaces: "packages/*" }), "packages/a/package.json": manifest({}) })), []);
});

test("discovery is bounded by depth, skips symbolic links, and returns sorted paths", async () => {
  const deep = "a/b/c/d/e/f/g/h/i/j";
  const root = await repository({
    "package.json": manifest({ workspaces: ["**"] }),
    "z/package.json": manifest({}),
    "a/package.json": manifest({}),
    [`${deep}/package.json`]: manifest({}),
    "real/package.json": manifest({}),
  });
  await symlink(join(root, "real"), join(root, "linked")).catch(() => undefined);
  const found = await discoverNpmWorkspaces(root);
  assert.deepEqual(found, [...found].sort());
  assert.ok(found.includes("a") && found.includes("z") && found.includes("real"));
  assert.ok(!found.includes(deep), "deeper than the depth bound");
  assert.ok(!found.includes("linked"), "symbolic links are not followed");
});

test("uv workspace members and excludes", async () => {
  const root = await repository({
    "pyproject.toml": '[project]\nname = "root"\n\n[tool.uv.workspace]\nmembers = ["libs/*"]\nexclude = ["libs/old"]\n',
    "libs/core/pyproject.toml": '[project]\nname = "core"\n',
    "libs/old/pyproject.toml": '[project]\nname = "old"\n',
    "libs/readme/README.md": "x",
  });
  assert.deepEqual(await discoverPythonWorkspaces(root), ["libs/core"]);
  assert.deepEqual(await discoverPythonWorkspaces(await repository({ "pyproject.toml": "not = [valid toml" })), []);
  assert.deepEqual(await discoverPythonWorkspaces(await repository({ "pyproject.toml": '[project]\nname = "x"\n', "libs/a/pyproject.toml": "" })), []);
});

test("usages belong to the deepest project directory that contains them", () => {
  const usages = ["a.js", "packages/a/x.js", "packages/a/sub/y.js", "packages/ab/z.js", "packages/b/w.js"].map((path) => ({ location: { path } }));
  const projects = ["", "packages/a", "packages/a/sub", "packages/b"];
  const owned = (directory: string) => usagesOwnedBy(usages, directory, projects).map((usage) => usage.location.path);
  assert.deepEqual(owned(""), ["a.js", "packages/ab/z.js"]);
  assert.deepEqual(owned("packages/a"), ["packages/a/x.js"]);
  assert.deepEqual(owned("packages/a/sub"), ["packages/a/sub/y.js"]);
  assert.deepEqual(owned("packages/b"), ["packages/b/w.js"]);
});

test("the npm detector reports deprecated packages and runtimes in each workspace, with their own usages", async () => {
  const root = await repository({
    "package.json": manifest({ workspaces: ["packages/*"], engines: { node: ">=22" }, dependencies: { request: "^2.88.0" } }),
    "index.js": 'const request = require("request");\nrequest.get("x");\n',
    "packages/a/package.json": manifest({ engines: { node: ">=18" }, dependencies: { request: "^2.88.0", "left-pad": "^1.3.0" } }),
    "packages/a/src/a.js": 'const request = require("request");\nrequest.get("a");\nrequest.post("a");\n',
    "packages/b/package.json": manifest({ devDependencies: { request: "^2.88.0" } }),
    "node_modules/x/index.js": 'require("request")',
  });
  const findings = await npmDetector.scan({ root });
  const byLocation = (ruleId: string) => findings.filter((finding) => finding.ruleId === ruleId).map((finding) => `${finding.location.path}:${finding.impact?.usageCount ?? "-"}`).sort();
  assert.deepEqual(byLocation("npm.package.request.deprecated"), ["package.json:2", "packages/a/package.json:3", "packages/b/package.json:0"]);
  assert.deepEqual(byLocation("npm.package.left-pad.deprecated"), ["packages/a/package.json:0"]);
  // ">=18" reaches the end-of-life lines 18, 19, and 20, as it does at the root of a single package; ">=22" at the root reaches none.
  assert.deepEqual(findings.filter((finding) => finding.ruleId.startsWith("nodejs.")).map((finding) => `${finding.ruleId}|${finding.location.path}`), ["nodejs.runtime.eol-18|packages/a/package.json", "nodejs.runtime.eol-19|packages/a/package.json", "nodejs.runtime.eol-20|packages/a/package.json"]);
  const rootRequest = findings.find((finding) => finding.location.path === "package.json" && finding.ruleId === "npm.package.request.deprecated")!;
  assert.deepEqual([...new Set(rootRequest.usages?.map((usage) => usage.location.path))], ["index.js"]);
});

test("a repository with only a pnpm workspace file and no root manifest still scans its packages", async () => {
  const root = await repository({
    "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
    "packages/a/package.json": manifest({ dependencies: { request: "^2.88.0" } }),
  });
  assert.deepEqual((await npmDetector.scan({ root })).map((finding) => finding.location.path), ["packages/a/package.json"]);
});

test("one malformed workspace manifest does not hide the others", async () => {
  const root = await repository({
    "package.json": manifest({ workspaces: ["packages/*"] }),
    "packages/a/package.json": "{ broken",
    "packages/b/package.json": manifest({ dependencies: { request: "^2.88.0" } }),
  });
  assert.deepEqual((await npmDetector.scan({ root })).map((finding) => finding.location.path), ["packages/b/package.json"]);
});

test("the Python detector reports each uv workspace member with its own dependencies and usages", async () => {
  const root = await repository({
    "pyproject.toml": '[project]\nname = "root"\nrequires-python = ">=3.12"\ndependencies = []\n\n[tool.uv.workspace]\nmembers = ["libs/*"]\n',
    "libs/core/pyproject.toml": '[project]\nname = "core"\nrequires-python = ">=3.8"\ndependencies = ["nose>=1.3"]\n',
    "libs/core/core/tests.py": "import nose\nnose.run()\n",
    "libs/other/pyproject.toml": '[project]\nname = "other"\ndependencies = ["nose"]\n',
  });
  const findings = await pythonDetector.scan({ root });
  assert.deepEqual(
    findings.map((finding) => `${finding.ruleId}|${finding.location.path}|${finding.impact?.usageCount ?? "-"}`).sort(),
    [
      "python.package.nose.maintenance-only|libs/core/pyproject.toml|2",
      "python.package.nose.maintenance-only|libs/other/pyproject.toml|0",
      "python.runtime.eol-3.9-and-older|libs/core/pyproject.toml|-",
    ],
  );
});

test("monorepo fixtures pass the conformance bounds and determinism checks", async () => {
  const npm = await repository({
    "package.json": manifest({ workspaces: ["packages/*"] }),
    "packages/a/package.json": manifest({ dependencies: { request: "^2.88.0" } }),
    "node_modules/hoisted/package.json": manifest({ dependencies: { request: "^2.88.0" } }),
  });
  await runDetectorConformance({ detector: npmDetector, fixtures: [{ name: "npm workspaces", root: npm, expectedFindings: await npmDetector.scan({ root: npm }) }], checks: [boundsCheck, determinismCheck] });
  const python = await repository({
    "pyproject.toml": '[tool.uv.workspace]\nmembers = ["libs/*"]\n',
    "libs/a/pyproject.toml": '[project]\nname = "a"\ndependencies = ["nose"]\n',
  });
  await runDetectorConformance({ detector: pythonDetector, fixtures: [{ name: "uv workspace", root: python, expectedFindings: await pythonDetector.scan({ root: python }) }], checks: [boundsCheck, determinismCheck] });
});

test("a pnpm lockfile with several YAML documents resolves versions from all of them, and a broken one is skipped", async () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "importers:",
    "  .: {}",
    "packages:",
    "  pnpm@10.0.0: {}",
    "---",
    "lockfileVersion: '9.0'",
    "packages:",
    "  request@2.88.2:",
    "    resolution: {integrity: sha512-x}",
    "",
  ].join("\n");
  const files = { "package.json": manifest({ dependencies: { request: "^2.88.0" } }), "pnpm-lock.yaml": lock };
  const [finding] = await npmDetector.scan({ root: await repository(files) });
  assert.match(finding!.summary, /resolved: 2\.88\.2/);
  const broken = await npmDetector.scan({ root: await repository({ ...files, "pnpm-lock.yaml": "packages: [unclosed\n---\npackages:\n  request@2.88.2: {}\n" }) });
  assert.equal(broken.length, 1);
});
