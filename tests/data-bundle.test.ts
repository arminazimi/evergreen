import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  buildDataBundle,
  bundleVersion,
  canonicalJson,
  computeContentDigest,
  dataBundleIntegrityProblems,
  DataBundleError,
  serializeDataBundle,
  sha256Hex,
} from "../src/data-bundle.js";
import type { DataBundle } from "../src/data-bundle.js";

const execute = promisify(execFile);
const createdAt = "2026-10-16T09:30:00Z";
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A throwaway copy of the registries, so tests can reformat or change them. */
async function registryCopy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-bundle-"));
  roots.push(root);
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  return root;
}

const build = (root: string, extra: Partial<Parameters<typeof buildDataBundle>[0]> = {}) =>
  buildDataBundle({ root, createdAt, minimumEvergreenVersion: "0.2.0", ...extra });

test("canonical JSON sorts keys at every level, drops whitespace, and refuses non-integers", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { y: null, x: true }], c: "é" } }), '{"a":{"c":"é","d":[3,{"x":true,"y":null}]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(canonicalJson({ k: "line\nbreak \"quoted\"" }), '{"k":"line\\nbreak \\"quoted\\""}');
  assert.throws(() => canonicalJson({ n: 1.5 }), /integers only/);
  assert.throws(() => canonicalJson({ n: Number.NaN }), DataBundleError);
  assert.throws(() => canonicalJson(() => 1), /Cannot write a function/);
});

test("two builds of the same input are byte for byte identical", async () => {
  const first = serializeDataBundle(await build(resolve(".")));
  const second = serializeDataBundle(await build(resolve(".")));
  assert.equal(first, second);
  assert.equal(sha256Hex(first), sha256Hex(second));
});

test("the same build from the command line is identical too", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-bundle-cli-"));
  roots.push(directory);
  const run = (out: string) => execute(process.execPath, [resolve("dist/tools/build-data-bundle.js"), "--created-at", createdAt, "--out", out]);
  await run(join(directory, "a.json"));
  await run(join(directory, "nested", "b.json"));
  assert.equal(await readFile(join(directory, "a.json"), "utf8"), await readFile(join(directory, "nested", "b.json"), "utf8"));
  await assert.rejects(execute(process.execPath, [resolve("dist/tools/build-data-bundle.js")]), (error: { stderr: string }) => /--created-at is required/.test(error.stderr));
});

test("the bundle lists every registry and the SHA map, and matches the published schema", async () => {
  const bundle = await build(resolve("."));
  assert.deepEqual(bundle.manifest.files.map((file) => file.path), [
    "registry/android.json",
    "registry/ci-images.json",
    "registry/container.json",
    "registry/dotnet.json",
    "registry/github-actions-shas.json",
    "registry/github-actions.json",
    "registry/go.json",
    "registry/java.json",
    "registry/kubernetes.json",
    "registry/nodejs.json",
    "registry/npm.json",
    "registry/python.json",
    "registry/ruby.json",
    "registry/rust.json",
    "registry/swift.json",
  ]);
  assert.equal(bundle.manifest.version, "2026.10.16");
  assert.equal(bundle.manifest.minimumEvergreenVersion, "0.2.0");
  for (const file of bundle.manifest.files.filter((item) => item.kind === "registry")) {
    const rules = (JSON.parse(await readFile(resolve(file.path), "utf8")) as { rules: unknown[] }).rules.length;
    assert.equal(file.rules, rules, file.path);
    assert.ok(file.maxReviewAgeDays! >= 1);
  }
  const schema = JSON.parse(await readFile(resolve("schemas/data-bundle.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(JSON.parse(serializeDataBundle(bundle))), true, JSON.stringify(validate.errors));
  assert.deepEqual(dataBundleIntegrityProblems(bundle), []);
});

test("formatting and key order in registry/ never change a digest", async () => {
  const baseline = await build(resolve("."));
  const root = await registryCopy();
  for (const file of ["registry/npm.json", "registry/github-actions-shas.json"]) {
    const reordered = JSON.parse(await readFile(join(root, file), "utf8")) as Record<string, unknown>;
    const reversed = Object.fromEntries(Object.entries(reordered).reverse());
    await writeFile(join(root, file), `${JSON.stringify(reversed)}\r\n\r\n`);
  }
  const reformatted = await build(root);
  assert.deepEqual(reformatted.manifest.files, baseline.manifest.files);
  assert.equal(reformatted.manifest.contentDigest, baseline.manifest.contentDigest);
});

test("the content address follows the data, not the version or the time", async () => {
  const root = resolve(".");
  const base = await build(root);
  const later = await build(root, { createdAt: "2027-01-02T03:04:05Z", revision: 3 });
  assert.equal(later.manifest.version, "2027.01.02.3");
  assert.notEqual(later.manifest.version, base.manifest.version);
  assert.equal(later.manifest.contentDigest, base.manifest.contentDigest);

  const changed = await registryCopy();
  const npm = JSON.parse(await readFile(join(changed, "registry/npm.json"), "utf8")) as { rules: Array<{ summary: string }> };
  npm.rules[0]!.summary += " (edited)";
  await writeFile(join(changed, "registry/npm.json"), JSON.stringify(npm));
  const edited = await build(changed);
  assert.notEqual(edited.manifest.contentDigest, base.manifest.contentDigest);
  const differing = edited.manifest.files.filter((file, index) => file.sha256 !== base.manifest.files[index]!.sha256);
  assert.deepEqual(differing.map((file) => file.path), ["registry/npm.json"]);
});

test("the version comes from the supplied time, never from a clock", () => {
  assert.equal(bundleVersion("2026-10-16T09:30:00Z"), "2026.10.16");
  assert.equal(bundleVersion("2026-10-16T09:30:00Z", 2), "2026.10.16.2");
  assert.throws(() => bundleVersion("2026-10-16"), /UTC like/);
  assert.throws(() => bundleVersion("2026-10-16T09:30:00+02:00"), /UTC like/);
  assert.throws(() => bundleVersion(createdAt, 0), /positive integer/);
});

test("a registry that does not validate cannot be bundled", async () => {
  const root = await registryCopy();
  const python = JSON.parse(await readFile(join(root, "registry/python.json"), "utf8")) as { rules: Array<Record<string, unknown>> };
  delete python.rules[0]!.provenance;
  await writeFile(join(root, "registry/python.json"), JSON.stringify(python));
  await assert.rejects(build(root), /provenance/);

  const wrongEcosystem = await registryCopy();
  const npm = JSON.parse(await readFile(join(wrongEcosystem, "registry/npm.json"), "utf8")) as Record<string, unknown>;
  await writeFile(join(wrongEcosystem, "registry/python.json"), JSON.stringify(npm));
  await assert.rejects(build(wrongEcosystem), /declares ecosystem "npm"/);

  const missing = await registryCopy();
  await rm(join(missing, "registry/github-actions-shas.json"));
  await assert.rejects(build(missing), /ENOENT/);
});

test("integrity checking finds tampering, omissions, and extras", async () => {
  const pristine = await build(resolve("."));
  const copy = (): DataBundle => structuredClone(pristine);

  const tampered = copy();
  (tampered.files["registry/npm.json"]!.rules as Array<{ summary: string }>)[0]!.summary = "Safe to use.";
  assert.deepEqual(dataBundleIntegrityProblems(tampered), ["registry/npm.json does not match its digest."]);

  const missing = copy();
  delete missing.files["registry/python.json"];
  assert.deepEqual(dataBundleIntegrityProblems(missing), ["registry/python.json is listed but missing."]);

  const extra = copy();
  extra.files["registry/other.json"] = { schemaVersion: "x" };
  assert.deepEqual(dataBundleIntegrityProblems(extra), ["registry/other.json is present but not listed."]);

  const wrongDigest = copy();
  wrongDigest.manifest.contentDigest = `sha256:${"0".repeat(64)}`;
  assert.deepEqual(dataBundleIntegrityProblems(wrongDigest), ["The content digest does not match the listed files."]);

  const wrongCount = copy();
  const actualRules = (pristine.files["registry/npm.json"]!.rules as unknown[]).length;
  wrongCount.manifest.files.find((file) => file.path === "registry/npm.json")!.rules = actualRules + 1;
  assert.deepEqual(dataBundleIntegrityProblems(wrongCount), [`registry/npm.json has ${actualRules} rules, not ${actualRules + 1}.`]);

  const droppedFromManifest = copy();
  droppedFromManifest.manifest.files = droppedFromManifest.manifest.files.filter((file) => file.path !== "registry/nodejs.json");
  const problems = dataBundleIntegrityProblems(droppedFromManifest);
  assert.ok(problems.includes("registry/nodejs.json is present but not listed."));
  assert.ok(problems.includes("The content digest does not match the listed files."));
});

test("the content address is the digest of the sorted path and digest lines", () => {
  const files = [
    { path: "registry/b.json", sha256: "b".repeat(64) },
    { path: "registry/a.json", sha256: "a".repeat(64) },
  ];
  assert.equal(computeContentDigest(files), `sha256:${sha256Hex(`registry/a.json ${"a".repeat(64)}\nregistry/b.json ${"b".repeat(64)}\n`)}`);
  assert.equal(computeContentDigest([...files].reverse()), computeContentDigest(files));
});
