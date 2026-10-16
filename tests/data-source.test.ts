import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, afterEach, test } from "node:test";

import { buildDataBundle, canonicalJson, serializeDataBundle } from "../src/data-bundle.js";
import type { DataBundle } from "../src/data-bundle.js";
import { DataSignatureError } from "../src/data-signature.js";
import {
  ACTIVE_FILE,
  BUNDLE_FILE,
  cachedBundleDirectory,
  configureActiveData,
  defaultCacheDirectory,
  resolveActiveData,
  SIGNATURE_FILE,
  verifyDataBundle,
} from "../src/data-source.js";
import type { DataSourceOptions } from "../src/data-source.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { checkDependency } from "../src/check-dependency.js";

const roots: string[] = [];
const signer = { identity: "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/tags/data-v2999.01.01", issuer: "https://token.actions.githubusercontent.com" };
const accepting = { verifySignature: () => signer };
const NEWER = "2999-01-01T00:00:00Z";

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
afterEach(() => configureActiveData());

const scratch = async (name: string) => {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
};

/** A copy of the registries in which `mutate` has changed the npm registry. */
async function registryRoot(mutate: (npm: { rules: Array<Record<string, unknown>> }) => void = () => undefined): Promise<string> {
  const root = await scratch("registry");
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const npm = JSON.parse(await readFile(join(root, "registry/npm.json"), "utf8")) as { rules: Array<Record<string, unknown>> };
  mutate(npm);
  await writeFile(join(root, "registry/npm.json"), JSON.stringify(npm));
  return root;
}

const expressRule = (npm: { rules: Array<Record<string, unknown>> }) =>
  npm.rules.push({
    ...structuredClone(npm.rules[0]!),
    id: "npm.package.express.test-only",
    purl: "pkg:npm/express",
    title: "express is test-only deprecated",
    "x-npm": { package: "express" },
  });

interface Cache {
  directory: string;
  bundle: DataBundle;
  bytes: string;
}

/** Writes a bundle into a cache directory the way `data update` will, with a placeholder signature file. */
async function cacheWith(bundle: DataBundle, options: { version?: string; bytes?: string } = {}): Promise<Cache> {
  const directory = await scratch("cache");
  const version = options.version ?? bundle.manifest.version;
  const bytes = options.bytes ?? serializeDataBundle(bundle);
  const bundleDirectory = cachedBundleDirectory(directory, version);
  await mkdir(bundleDirectory, { recursive: true });
  await writeFile(join(bundleDirectory, BUNDLE_FILE), bytes);
  await writeFile(join(bundleDirectory, SIGNATURE_FILE), "{}");
  await writeFile(join(directory, "data", ACTIVE_FILE), JSON.stringify({ version }));
  return { directory, bundle, bytes };
}

const newerBundle = async (mutate?: Parameters<typeof registryRoot>[0]) =>
  buildDataBundle({ root: await registryRoot(mutate), createdAt: NEWER, minimumEvergreenVersion: "0.1.0" });

const resolveWith = (cache: Cache | string, extra: DataSourceOptions = {}) =>
  resolveActiveData({ cacheDirectory: typeof cache === "string" ? cache : cache.directory, ...accepting, ...extra });

test("without downloaded data the bundled data is used, silently", async () => {
  const data = await resolveWith(await scratch("empty"));
  assert.equal(data.info.source, "bundled");
  assert.deepEqual(data.info.warnings, []);
  assert.equal(data.info.createdAt, null);
  assert.match(data.info.reviewedThrough, /^\d{4}-\d{2}-\d{2}$/);
  const npm = (await data.read("registry/npm.json")) as { ecosystem: string };
  assert.equal(npm.ecosystem, "npm");
});

test("a verified, newer download is used, and its rules reach the scanners", async () => {
  const cache = await cacheWith(await newerBundle(expressRule));
  const data = await resolveWith(cache);
  assert.equal(data.info.source, "cache");
  assert.equal(data.info.version, "2999.01.01");
  assert.equal(data.info.createdAt, NEWER);
  assert.equal(data.info.contentDigest, cache.bundle.manifest.contentDigest);
  assert.deepEqual(data.info.signer, signer);
  assert.deepEqual(data.info.warnings, []);
  assert.ok(((await data.read("registry/npm.json")) as { rules: Array<{ id: string }> }).rules.some((rule) => rule.id === "npm.package.express.test-only"));

  const project = await scratch("project");
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo", dependencies: { express: "^4.18.0" } }));
  const before = await scanRepository(project, builtInDetectors);
  assert.deepEqual(before.findings.filter((finding) => finding.ruleId.includes("express")), []);

  configureActiveData({ cacheDirectory: cache.directory, ...accepting });
  const after = await scanRepository(project, builtInDetectors);
  assert.deepEqual(after.findings.filter((finding) => finding.ruleId.includes("express")).map((finding) => finding.ruleId), ["npm.package.express.test-only"]);
  assert.equal((await checkDependency("pkg:npm/express@4.18.0")).status, "affected");
});

test("a tampered download fails closed: bundled data is used and the scan says so", async () => {
  const bundle = await newerBundle(expressRule);
  const tampered = structuredClone(bundle);
  (tampered.files["registry/npm.json"]!.rules as Array<{ summary: string }>)[0]!.summary = "Safe to use.";
  const cache = await cacheWith(bundle, { bytes: serializeDataBundle(tampered) });
  const data = await resolveWith(cache);
  assert.equal(data.info.source, "bundled");
  assert.match(data.info.warnings[0]!, /Ignoring downloaded lifecycle data 2999\.01\.01: registry\/npm\.json does not match its digest\. Using the data bundled with Evergreen/);
  assert.ok(!((await data.read("registry/npm.json")) as { rules: Array<{ id: string }> }).rules.some((rule) => rule.id === "npm.package.express.test-only"));

  const project = await scratch("project");
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo", dependencies: { express: "^4.18.0" } }));
  configureActiveData({ cacheDirectory: cache.directory, ...accepting });
  const result = await scanRepository(project, builtInDetectors);
  assert.deepEqual(result.findings.filter((finding) => finding.ruleId.includes("express")), []);
  assert.match(result.diagnostics.join("\n"), /Ignoring downloaded lifecycle data 2999\.01\.01/);
});

test("with the real signature check, a download without Evergreen's signature is never loaded", async () => {
  const cache = await cacheWith(await newerBundle(expressRule));
  const signatureFile = join(cachedBundleDirectory(cache.directory, "2999.01.01"), SIGNATURE_FILE);
  for (const content of ["{}", await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt.sigstore.json"), "utf8"), "garbage"]) {
    await writeFile(signatureFile, content);
    const data = await resolveActiveData({ cacheDirectory: cache.directory });
    assert.equal(data.info.source, "bundled", content.slice(0, 12));
    assert.match(data.info.warnings[0]!, /Ignoring downloaded lifecycle data 2999\.01\.01: (The signature|The signature file)/);
  }
});

test("everything after the signature is checked too", async () => {
  const cases: Array<[string, (bundle: DataBundle) => void, RegExp]> = [
    ["a newer format", (bundle) => { (bundle.manifest as unknown as Record<string, unknown>).schemaVersion = "evergreen.data-bundle.v2"; }, /Unsupported bundle format/],
    ["a bundle that needs a newer Evergreen", (bundle) => { bundle.manifest.minimumEvergreenVersion = "99.0.0"; }, /needs Evergreen 99\.0\.0 or newer/],
    ["an incomplete bundle", (bundle) => { delete bundle.files["registry/python.json"]; bundle.manifest.files = bundle.manifest.files.filter((file) => file.path !== "registry/python.json"); }, /incomplete: registry\/python\.json missing/],
    ["an unsafe path", (bundle) => { bundle.manifest.files[0]!.path = "../evil.json"; }, /unsafe or missing path/],
    ["a wrong content digest", (bundle) => { bundle.manifest.contentDigest = `sha256:${"0".repeat(64)}`; }, /content digest/],
    ["an unlisted file", (bundle) => { bundle.files["registry/extra.json"] = {}; }, /present but not listed/],
  ];
  for (const [name, mutate, expected] of cases) {
    const bundle = structuredClone(await newerBundle());
    mutate(bundle);
    const data = await resolveWith(await cacheWith(bundle));
    assert.equal(data.info.source, "bundled", name);
    assert.match(data.info.warnings[0]!, expected, name);
  }
});

test("downloaded data that is not newer than the bundled data is not used", async () => {
  const bundled = await resolveWith(await scratch("none"));
  const sameDay = await buildDataBundle({ root: resolve("."), createdAt: `${bundled.info.reviewedThrough}T12:00:00Z`, minimumEvergreenVersion: "0.1.0" });
  const data = await resolveWith(await cacheWith(sameDay));
  assert.equal(data.info.source, "bundled");
  assert.match(data.info.warnings[0]!, /is not newer than the data bundled with Evergreen/);
});

test("missing or damaged cache bookkeeping is reported and bundled data is used", async () => {
  const bundle = await newerBundle();
  const missing = await cacheWith(bundle);
  await rm(join(cachedBundleDirectory(missing.directory, "2999.01.01"), BUNDLE_FILE));
  assert.match((await resolveWith(missing)).info.warnings[0]!, /its files are missing/);

  const noPointer = await scratch("pointer");
  await mkdir(join(noPointer, "data"), { recursive: true });
  for (const content of ["not json", JSON.stringify({ version: "../../etc" }), JSON.stringify({}), JSON.stringify([])]) {
    await writeFile(join(noPointer, "data", ACTIVE_FILE), content);
    const data = await resolveWith(noPointer);
    assert.equal(data.info.source, "bundled", content);
    assert.match(data.info.warnings[0]!, /Ignoring downloaded lifecycle data: active\.json/, content);
  }
});

test("a bundle verifies only with a good signature, and the bytes that were signed are the bytes that are parsed", async () => {
  const bytes = Buffer.from(serializeDataBundle(await newerBundle()));
  const failing = { verifySignature: () => { throw new DataSignatureError("The signature did not verify: nope"); } };
  assert.throws(() => verifyDataBundle(bytes, "{}", failing), /did not verify: nope/);
  assert.equal(verifyDataBundle(bytes, "{}", accepting).bundle.manifest.version, "2999.01.01");
  let seen: Uint8Array | undefined;
  verifyDataBundle(bytes, "{}", { verifySignature: (received) => ((seen = received), signer) });
  assert.equal(Buffer.compare(Buffer.from(seen!), bytes), 0);
  assert.throws(() => verifyDataBundle(Buffer.from("not json"), "{}", accepting), /not valid JSON/);
  assert.throws(() => verifyDataBundle(Buffer.from("[]"), "{}", accepting), /manifest and files/);
  assert.equal(`${canonicalJson(JSON.parse(bytes.toString("utf8")))}\n`, bytes.toString("utf8"), "the signed form is canonical JSON and a newline");
});

test("the cache directory follows the platform's conventions", () => {
  assert.equal(defaultCacheDirectory({ EVERGREEN_DATA_DIR: "/custom" }, "linux", "/home/me"), "/custom");
  assert.equal(defaultCacheDirectory({}, "darwin", "/Users/me"), join("/Users/me", "Library", "Caches", "evergreen"));
  assert.equal(defaultCacheDirectory({}, "linux", "/home/me"), join("/home/me", ".cache", "evergreen"));
  assert.equal(defaultCacheDirectory({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/me"), join("/xdg", "evergreen"));
  assert.equal(defaultCacheDirectory({ LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "win32", "C:\\Users\\me"), join("C:\\Users\\me\\AppData\\Local", "evergreen", "Cache"));
});
