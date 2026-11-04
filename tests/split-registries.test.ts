import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { capabilities } from "../src/capabilities/capabilities/index.js";
import { ecosystems } from "../src/capabilities/ecosystems/index.js";
import { assembleCapabilityManifest } from "../src/capabilities/manifest.js";
import { surfaces } from "../src/capabilities/surfaces/index.js";
import type { ManifestEcosystem } from "../src/capabilities/schema.js";
import {
  assembleThresholds,
  assembleThresholdsText,
  THRESHOLDS_DIRECTORY,
  THRESHOLDS_DOCUMENT,
} from "../benchmarks/thresholds/index.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const registryKinds = [
  { directory: "src/capabilities/ecosystems", items: ecosystems },
  { directory: "src/capabilities/capabilities", items: capabilities },
  { directory: "src/capabilities/surfaces", items: surfaces },
] as const;

async function committedThresholds(): Promise<Thresholds> {
  return JSON.parse(await readFile(resolve(THRESHOLDS_DOCUMENT), "utf8")) as Thresholds;
}

test("every capability, ecosystem, and surface lives in exactly one named file", async () => {
  const manifest = getCapabilityManifest();
  for (const { directory, items } of registryKinds) {
    const files = (await readdir(resolve(directory)))
      .filter((name) => name.endsWith(".ts") && name !== "index.ts")
      .sort();
    assert.deepEqual(files, items.map((item) => `${item.id}.ts`).sort(), `${directory} holds one file per item`);
  }
  // The assembled manifest lists items in the same order as the registries they come from.
  assert.deepEqual(
    manifest.ecosystems.map((item) => item.id),
    ecosystems.map((item) => item.id),
  );
  assert.deepEqual(
    manifest.capabilities.map((item) => item.id),
    capabilities.map((item) => item.id),
  );
  assert.deepEqual(
    manifest.surfaces.map((item) => item.id),
    surfaces.map((item) => item.id),
  );
});

test("the assembled capability manifest equals the committed example", async () => {
  const example = JSON.parse(await readFile(resolve("examples/capabilities.json"), "utf8"));
  assert.deepEqual(getCapabilityManifest(), example);
});

test("adding an ecosystem changes only its own file and appends to the assembled manifest", async () => {
  const before = getCapabilityManifest();
  const added: ManifestEcosystem = {
    id: "synthetic",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["synthetic"],
  };

  const assembled = assembleCapabilityManifest({
    ecosystems: [...ecosystems, added],
    capabilities,
    surfaces,
  });

  assert.deepEqual(assembled.ecosystems.slice(0, -1), before.ecosystems);
  assert.deepEqual(assembled.ecosystems.at(-1), added);
  assert.deepEqual(assembled.capabilities, before.capabilities, "no capability file changes");
  assert.deepEqual(assembled.surfaces, before.surfaces, "no surface file changes");
  assert.equal(
    ecosystems.some((ecosystem) => ecosystem.id === "synthetic"),
    false,
    "the registry itself is untouched",
  );

  // The registry indexes only import and order items; item data lives in item files. An addition
  // therefore adds its file and one registration line, and edits nothing else.
  for (const kind of ["ecosystems", "capabilities", "surfaces"]) {
    const index = await readFile(resolve(`src/capabilities/${kind}/index.ts`), "utf8");
    assert.doesNotMatch(
      index,
      /status:|description:|detectorIds:|entryPoints:|capabilityIds:|version:/,
      `${kind}/index.ts holds no item data`,
    );
  }
  assert.doesNotMatch(
    await readFile(resolve("src/capabilities.ts"), "utf8"),
    /status:|description:|detectorIds:|entryPoints:|capabilityIds:/,
    "src/capabilities.ts holds no item data",
  );
});

test("the thresholds document is assembled from one file per detector, byte for byte", async () => {
  const committed = await committedThresholds();
  const committedText = await readFile(resolve(THRESHOLDS_DOCUMENT), "utf8");
  const files = (await readdir(resolve(THRESHOLDS_DIRECTORY)))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();

  assert.deepEqual(files, Object.keys(committed.detectors).sort(), "one file per detector and nothing else");
  assert.deepEqual(assembleThresholds().detectors, committed.detectors);
  assert.equal(assembleThresholdsText(), committedText, "the assembled document matches the committed one");
});

test("adding a detector changes only its own file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-thresholds-"));
  try {
    const names = (await readdir(resolve(THRESHOLDS_DIRECTORY))).filter((name) => name.endsWith(".json")).sort();
    const originals = new Map<string, string>();
    for (const name of names) {
      const contents = await readFile(join(resolve(THRESHOLDS_DIRECTORY), name), "utf8");
      originals.set(name, contents);
      await cp(join(resolve(THRESHOLDS_DIRECTORY), name), join(directory, name));
    }

    // A new detector is a new file, with no position so it lands at the end. No existing file changes.
    await writeFile(
      join(directory, "synthetic.json"),
      `${JSON.stringify({ level: "experimental", stable: false, minPrecision: 0.9 }, null, 2)}\n`,
    );
    const assembled = assembleThresholds(directory);

    assert.equal(Object.keys(assembled.detectors).at(-1), "synthetic", "the new detector is appended");
    assert.deepEqual(assembled.detectors.synthetic, { level: "experimental", stable: false, minPrecision: 0.9 });
    const committed = await committedThresholds();
    for (const [id, threshold] of Object.entries(committed.detectors)) {
      assert.deepEqual(assembled.detectors[id], threshold, `${id} is unchanged`);
    }

    for (const name of names) {
      assert.equal(await readFile(join(directory, name), "utf8"), originals.get(name), `${name} is untouched`);
      assert.equal(
        await readFile(join(resolve(THRESHOLDS_DIRECTORY), name), "utf8"),
        originals.get(name),
        `${name} is untouched in the registry`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
