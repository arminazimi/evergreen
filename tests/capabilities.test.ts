import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { capabilityManifestSchema, getCapabilityManifest } from "../src/capabilities.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/capabilities.v1.schema.json"), "utf8"));
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test("capability manifest and committed example validate against the public schema", async () => {
  const validate = await validator();
  const manifest = getCapabilityManifest();
  const example = JSON.parse(await readFile(resolve("examples/capabilities.json"), "utf8"));

  assert.ok(validate(manifest), JSON.stringify(validate.errors));
  assert.ok(validate(example), JSON.stringify(validate.errors));
  assert.deepEqual(example, manifest);
});

const maturityRank = { experimental: 0, beta: 1, stable: 2 } as const;

test("ecosystem maturity is the lowest detector level in benchmarks/thresholds.json", async () => {
  const manifest = getCapabilityManifest();
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as {
    detectors: Record<string, { level: keyof typeof maturityRank }>;
  };
  for (const ecosystem of manifest.ecosystems) {
    assert.ok(ecosystem.detectorIds.length > 0, `${ecosystem.id} names no detector`);
    const levels = ecosystem.detectorIds.map((id) => {
      const detector = thresholds.detectors[id];
      assert.ok(detector, `${ecosystem.id} names ${id}, which benchmarks/thresholds.json does not list`);
      return detector.level;
    });
    const lowest = levels.reduce((low, level) => (maturityRank[level] < maturityRank[low] ? level : low), levels[0]!);
    assert.equal(ecosystem.maturity, lowest, `${ecosystem.id} must take the lowest level of ${ecosystem.detectorIds.join(", ")}`);
  }
});

test("the schema accepts every maturity level, rejects an unknown one, and accepts a manifest without it", async () => {
  const validate = await validator();
  const example = JSON.parse(await readFile(resolve("examples/capabilities.json"), "utf8"));

  const beta = structuredClone(example);
  beta.ecosystems[0].maturity = "beta";
  assert.ok(validate(beta), JSON.stringify(validate.errors));

  const unknown = structuredClone(example);
  unknown.ecosystems[0].maturity = "graduate";
  assert.equal(validate(unknown), false);
  assert.match(JSON.stringify(validate.errors), /maturity/);

  const older = structuredClone(example);
  for (const ecosystem of older.ecosystems) delete ecosystem.maturity;
  assert.ok(validate(older), JSON.stringify(validate.errors));
});

test("the exported manifest schema parses a 1.0.0 manifest without maturity", async () => {
  const older = JSON.parse(await readFile(resolve("examples/capabilities.json"), "utf8"));
  older.manifestVersion = "1.0.0";
  for (const ecosystem of older.ecosystems) delete ecosystem.maturity;

  const parsed = capabilityManifestSchema.parse(older);
  assert.equal(parsed.manifestVersion, "1.0.0");
  assert.ok(parsed.ecosystems.every((ecosystem) => ecosystem.maturity === undefined));
});

test("every surface uses shared capability identifiers and unsupported behavior is explicit", () => {
  const manifest = getCapabilityManifest();
  const identifiers = new Set(manifest.capabilities.map((capability) => capability.id));
  const ecosystemIdentifiers = new Set(manifest.ecosystems.map((ecosystem) => ecosystem.id));
  assert.equal(identifiers.size, manifest.capabilities.length);
  assert.equal(ecosystemIdentifiers.size, manifest.ecosystems.length);
  for (const surface of manifest.surfaces) {
    assert.ok(surface.capabilityIds.every((identifier) => identifiers.has(identifier)));
  }
  for (const capability of manifest.capabilities) {
    assert.ok(capability.ecosystems.every((identifier) => ecosystemIdentifiers.has(identifier)));
  }
  assert.deepEqual(
    new Set(manifest.surfaces.map((surface) => surface.kind)),
    new Set(["cli", "mcp", "skill", "plugin", "ci"]),
  );
  assert.equal(manifest.compatibility.unlistedCapabilities, "unsupported");
  assert.equal(manifest.compatibility.unlistedEcosystems, "unsupported");
  assert.ok(manifest.capabilities.some((capability) => capability.status === "unsupported"));
});

test("CLI exposes the stable capability manifest as deterministic JSON", async () => {
  const first = await execute(process.execPath, [cli, "capabilities", "--json"]);
  const second = await execute(process.execPath, [cli, "capabilities", "--json"]);
  const output = JSON.parse(first.stdout);
  const validate = await validator();

  assert.equal(first.stdout, second.stdout);
  assert.ok(validate(output), JSON.stringify(validate.errors));
  assert.deepEqual(output, getCapabilityManifest());
});
