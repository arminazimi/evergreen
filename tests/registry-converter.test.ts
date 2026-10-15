import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { bundledEvents, convertRegistryV1 } from "../tools/registry-v1-to-v2.js";
import { legacyRule, registryV2Issues } from "../src/registry.js";

const run = promisify(execFile);
const options = { observedAt: "2026-10-13", reviewedAt: "2026-10-14", reviewer: "arminazimi" };
const names = ["github-actions", "nodejs", "npm", "python"] as const;

async function v1(name: string): Promise<{ schemaVersion: string; rules: Record<string, unknown>[] }> {
  return JSON.parse(await readFile(resolve("registry", `${name}.json`), "utf8"));
}

test("converts every bundled v1 registry to a valid v2 registry that reads back unchanged", async () => {
  for (const name of names) {
    const source = await v1(name);
    if (!source.schemaVersion.endsWith(".v1")) continue; // already migrated
    const converted = convertRegistryV1(source, options);
    assert.deepEqual(registryV2Issues(converted), [], name);
    assert.equal(converted.ecosystem, name);
    assert.equal(converted.rules.length, source.rules.length);
    converted.rules.forEach((rule, index) => assert.deepEqual(legacyRule(rule), source.rules[index], rule.id));
  }
});

test("chooses a lifecycle event for every bundled rule", async () => {
  const ids = (await Promise.all(names.map(v1))).flatMap((registry) => registry.rules.map((rule) => rule.id as string));
  assert.deepEqual(Object.keys(bundledEvents).sort(), [...ids].sort());
});

test("produces the same output every time", async () => {
  const source = await v1("npm");
  if (!source.schemaVersion.endsWith(".v1")) return;
  assert.equal(JSON.stringify(convertRegistryV1(source, options)), JSON.stringify(convertRegistryV1(source, options)));
});

test("derives PURL and VERS identities from each ecosystem's fields", () => {
  const sources = { title: "Source", url: "https://example.com/" };
  const rule = (extra: Record<string, unknown>) => ({ ecosystem: "x", title: "T", summary: "S", severity: "high", sources: [sources], ...extra });
  const identity = (schema: string, ecosystem: string, extra: Record<string, unknown>, id: string) => {
    const converted = convertRegistryV1(
      { schemaVersion: `evergreen.${schema}-registry.v1`, rules: [rule({ id, ecosystem, ...extra })] },
      { ...options, events: { [id]: "deprecated" } },
    ).rules[0]!;
    return [converted.purl, converted.vers];
  };

  assert.deepEqual(identity("github-actions", "github-actions", { action: "actions/checkout", supportedFromMajor: 5 }, "a.b"), ["pkg:github/actions/checkout", "vers:semver/<5.0.0"]);
  assert.deepEqual(identity("nodejs", "nodejs", { major: 20 }, "a.b"), ["pkg:generic/nodejs", "vers:semver/>=20.0.0|<21.0.0"]);
  assert.deepEqual(identity("nodejs", "nodejs", { maximumMajor: 17 }, "a.b"), ["pkg:generic/nodejs", "vers:semver/<18.0.0"]);
  assert.deepEqual(identity("npm", "npm", { package: "request" }, "a.b"), ["pkg:npm/request", "vers:npm/*"]);
  assert.deepEqual(identity("npm", "npm", { package: "@angular/core" }, "a.b"), ["pkg:npm/%40angular/core", "vers:npm/*"]);
  assert.deepEqual(identity("python", "python", { kind: "runtime", maximumVersion: "3.9" }, "a.b"), ["pkg:generic/python", "vers:pypi/<3.10"]);
  assert.deepEqual(identity("python", "python", { kind: "package", package: "Django_Nose" }, "a.b"), ["pkg:pypi/django-nose", "vers:pypi/*"]);
});

test("refuses input it cannot convert faithfully", () => {
  const base = { ecosystem: "npm", title: "T", summary: "S", severity: "high", sources: [{ title: "S", url: "https://example.com/" }] };
  const registry = (rules: unknown[], schemaVersion = "evergreen.npm-registry.v1") => ({ schemaVersion, rules });
  assert.throws(() => convertRegistryV1(registry([{ ...base, id: "npm.new", package: "left" }]), options), /No lifecycle event for rule "npm\.new"/);
  assert.throws(() => convertRegistryV1(registry([{ ...base, id: "npm.package.request.deprecated" }]), options), /needs package/);
  assert.throws(() => convertRegistryV1(registry([], "evergreen.registry.v2"), options), /Not a v1 registry/);
  assert.throws(() => convertRegistryV1(registry([], "evergreen.cobol-registry.v1"), options), /No v1 → v2 mapping/);
  assert.throws(() => convertRegistryV1({}, options), /v1 registry object/);
  assert.throws(
    () => convertRegistryV1(registry([{ ...base, id: "npm.package.request.deprecated", package: "request" }]), { ...options, reviewedAt: "2026-02-30" }),
    /reviewedAt must be a valid date/,
  );
  assert.throws(
    () => convertRegistryV1(registry([{ ...base, id: "python.runtime.x", ecosystem: "python", kind: "runtime", maximumVersion: "3" }], "evergreen.python-registry.v1"), { ...options, events: { "python.runtime.x": "end-of-life" } }),
    /MAJOR\.MINOR/,
  );
});

test("carries a freshness window into the envelope", async () => {
  const source = await v1("nodejs");
  if (!source.schemaVersion.endsWith(".v1")) return;
  assert.deepEqual(convertRegistryV1(source, { ...options, freshnessDays: 180 }).freshness, { maxReviewAgeDays: 180 });
});

test("runs from the command line", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-convert-"));
  try {
    const input = join(directory, "npm.json");
    await writeFile(input, JSON.stringify({
      schemaVersion: "evergreen.npm-registry.v1",
      rules: [{ id: "npm.package.request.deprecated", ecosystem: "npm", package: "request", title: "T", summary: "S", severity: "high", sources: [{ title: "S", url: "https://example.com/" }] }],
    }));
    const script = resolve("dist/tools/registry-v1-to-v2.js");
    const flags = ["--observed-at", "2026-10-13", "--reviewed-at", "2026-10-14", "--reviewer", "arminazimi"];

    const { stdout } = await run(process.execPath, [script, input, ...flags]);
    assert.equal(JSON.parse(stdout).rules[0].purl, "pkg:npm/request");

    const output = join(directory, "out.json");
    await run(process.execPath, [script, input, ...flags, "--out", output]);
    assert.equal(JSON.parse(await readFile(output, "utf8")).schemaVersion, "evergreen.registry.v2");

    await assert.rejects(run(process.execPath, [script, input]), /--observed-at is required/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
