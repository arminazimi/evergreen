import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, afterEach, test } from "node:test";
import { promisify } from "node:util";

import { buildDataBundle, serializeDataBundle } from "../src/data-bundle.js";
import type { DataBundle } from "../src/data-bundle.js";
import {
  ACTIVE_FILE,
  BUNDLE_FILE,
  cachedBundleDirectory,
  configureActiveData,
  DataPinError,
  resolveActiveData,
  SIGNATURE_FILE,
} from "../src/data-source.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { renderDataStatusText, dataStatusFrom } from "../src/data-status.js";

const execute = promisify(execFile);
const roots: string[] = [];
const signer = { identity: "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/tags/data-v2999.01.01", issuer: "https://token.actions.githubusercontent.com" };
const accepting = { verifySignature: () => signer };

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
afterEach(() => configureActiveData());

const scratch = async (name: string) => {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
};

/** A bundle in which `package` has a rule named after the bundle, so a scan shows which data was used. */
async function bundleWithRule(createdAt: string, packageName: string): Promise<DataBundle> {
  const root = await scratch("registry");
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const npm = JSON.parse(await readFile(join(root, "registry/npm.json"), "utf8")) as { rules: Array<Record<string, unknown>> };
  npm.rules.push({ ...structuredClone(npm.rules[0]!), id: `npm.package.${packageName}.pin-test`, purl: `pkg:npm/${packageName}`, title: `${packageName} is deprecated`, "x-npm": { package: packageName } });
  await writeFile(join(root, "registry/npm.json"), JSON.stringify(npm));
  return buildDataBundle({ root, createdAt, minimumEvergreenVersion: "0.1.0" });
}

async function store(cache: string, bundle: DataBundle, bytes?: string): Promise<void> {
  const directory = cachedBundleDirectory(cache, bundle.manifest.version);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, BUNDLE_FILE), bytes ?? serializeDataBundle(bundle));
  await writeFile(join(directory, SIGNATURE_FILE), "{}");
}

/** A cache holding two verified bundles: January (pinned in these tests) and June (the active one). */
async function twoVersions() {
  const cache = await scratch("cache");
  const january = await bundleWithRule("2999-01-01T00:00:00Z", "janpkg");
  const june = await bundleWithRule("2999-06-01T00:00:00Z", "junpkg");
  await store(cache, january);
  await store(cache, june);
  await mkdir(join(cache, "data"), { recursive: true });
  await writeFile(join(cache, "data", ACTIVE_FILE), JSON.stringify({ version: "2999.06.01" }));
  return { cache, january, june };
}

const rulesOf = async (data: Awaited<ReturnType<typeof resolveActiveData>>) =>
  ((await data.read("registry/npm.json")) as { rules: Array<{ id: string }> }).rules.map((rule) => rule.id).filter((id) => id.endsWith(".pin-test"));

test("without a pin the active download is used; a pin selects another version exactly", async () => {
  const { cache } = await twoVersions();
  const automatic = await resolveActiveData({ cacheDirectory: cache, ...accepting });
  assert.deepEqual([automatic.info.source, automatic.info.version], ["cache", "2999.06.01"]);
  assert.deepEqual(await rulesOf(automatic), ["npm.package.junpkg.pin-test"]);

  const pinned = await resolveActiveData({ cacheDirectory: cache, pinnedVersion: "2999.01.01", ...accepting });
  assert.deepEqual([pinned.info.source, pinned.info.version, pinned.info.createdAt], ["pinned", "2999.01.01", "2999-01-01T00:00:00Z"]);
  assert.deepEqual(pinned.info.signer, signer);
  assert.deepEqual(await rulesOf(pinned), ["npm.package.janpkg.pin-test"]);
  assert.match(renderDataStatusText(dataStatusFrom(pinned)), /Source: pinned/);
});

test("a pinned version decides what a scan finds, so CI results do not drift", async () => {
  const { cache } = await twoVersions();
  const project = await scratch("project");
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo", dependencies: { janpkg: "^1.0.0", junpkg: "^1.0.0" } }));
  const scanWith = async (pin?: string) => {
    configureActiveData({ cacheDirectory: cache, ...accepting, ...(pin ? { pinnedVersion: pin } : {}) });
    return (await scanRepository(project, builtInDetectors)).findings.map((finding) => finding.ruleId).filter((id) => id.endsWith(".pin-test"));
  };
  assert.deepEqual(await scanWith(), ["npm.package.junpkg.pin-test"], "latest download");
  assert.deepEqual(await scanWith("2999.01.01"), ["npm.package.janpkg.pin-test"], "pinned to the older version");
  assert.deepEqual(await scanWith("bundled"), [], "pinned to the data shipped with the release");
});

test("pinning bundled data ignores a newer download", async () => {
  const { cache } = await twoVersions();
  const data = await resolveActiveData({ cacheDirectory: cache, pinnedVersion: "bundled", ...accepting });
  assert.deepEqual([data.info.source, data.info.warnings], ["bundled", []]);
  assert.deepEqual(await rulesOf(data), []);
});

test("a pin that cannot be met is an error with the way out, never a quiet fallback", async () => {
  const { cache, january } = await twoVersions();
  const options = { cacheDirectory: cache, ...accepting };
  await assert.rejects(resolveActiveData({ ...options, pinnedVersion: "2999.03.03" }), (error: unknown) => error instanceof DataPinError && /2999\.03\.03 is pinned but is not in .*evergreen data update --data-version 2999\.03\.03/s.test(error.message));
  for (const bad of ["latest", "../../etc", "2999.1.1", "", "2999.01.01/x"]) {
    await assert.rejects(resolveActiveData({ ...options, pinnedVersion: bad }), /is not a data version/, bad);
  }

  const tampered = structuredClone(january);
  (tampered.files["registry/npm.json"]!.rules as Array<{ summary: string }>)[0]!.summary = "Safe to use.";
  await store(cache, january, serializeDataBundle(tampered));
  await assert.rejects(resolveActiveData({ ...options, pinnedVersion: "2999.01.01" }), /pinned but cannot be used: registry\/npm\.json does not match its digest/);
  await assert.rejects(resolveActiveData({ cacheDirectory: cache, pinnedVersion: "2999.06.01" }), /pinned but cannot be used: The signature/, "with the real signature check, the placeholder signature is refused");

  const mislabelled = await scratch("cache");
  await store(mislabelled, await bundleWithRule("2999-06-01T00:00:00Z", "junpkg"));
  await cp(cachedBundleDirectory(mislabelled, "2999.06.01"), cachedBundleDirectory(mislabelled, "2999.02.02"), { recursive: true });
  await assert.rejects(resolveActiveData({ cacheDirectory: mislabelled, pinnedVersion: "2999.02.02", ...accepting }), /stored bundle says it is version 2999\.06\.01/);
});

async function cli(args: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await execute(process.execPath, [resolve("dist/src/cli.js"), ...args], { env: { ...process.env, ...env } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

test("the CLI takes the pin from --data-version or EVERGREEN_DATA_VERSION, and the flag wins", async () => {
  const cache = await scratch("cache");
  const project = await scratch("project");
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo" }));
  const env = { EVERGREEN_DATA_DIR: cache };

  const missing = await cli(["scan", project, "--data-version", "2999.01.01"], env);
  assert.equal(missing.code, 3);
  assert.match(missing.stderr, /2999\.01\.01 is pinned but is not in .*evergreen data update --data-version 2999\.01\.01/s);

  const fromEnvironment = await cli(["scan", project], { ...env, EVERGREEN_DATA_VERSION: "2999.01.01" });
  assert.equal(fromEnvironment.code, 3);
  assert.match(fromEnvironment.stderr, /2999\.01\.01 is pinned/);

  const flagWins = await cli(["scan", project, "--data-version", "bundled"], { ...env, EVERGREEN_DATA_VERSION: "2999.01.01" });
  assert.equal(flagWins.code, 0, flagWins.stderr);

  const status = JSON.parse((await cli(["data", "status", "--json", "--data-version", "bundled"], env)).stdout) as { source: string };
  assert.equal(status.source, "bundled");

  for (const args of [["check", "pkg:npm/request", "--data-version", "latest"], ["scan", project, "--data-version"], ["scan", project, "--data-version", "--json"]]) {
    const bad = await cli(args, env);
    assert.equal(bad.code, 2, args.join(" "));
  }
  assert.match((await cli(["check", "pkg:npm/request", "--data-version", "latest"], env)).stderr, /not a data version/);
  assert.match((await cli(["scan", project, "--data-version"], env)).stderr, /--data-version needs a version/);
});

test("a pin applies to checks and explanations too, and an empty variable means no pin", async () => {
  const cache = await scratch("cache");
  const env = { EVERGREEN_DATA_DIR: cache };
  assert.equal((await cli(["check", "pkg:npm/request"], { ...env, EVERGREEN_DATA_VERSION: "" })).code, 1, "an empty variable is no pin");
  const pinned = await cli(["check", "pkg:npm/request", "--data-version", "2999.01.01"], env);
  assert.equal(pinned.code, 3);
  assert.match(pinned.stderr, /is pinned but is not in/);
});
