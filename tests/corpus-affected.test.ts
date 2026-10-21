import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  affectedEcosystems,
  CORPUS_ECOSYSTEMS,
  describeAffected,
  DETECTOR_ECOSYSTEMS,
  FIXTURE_ECOSYSTEMS,
  parseChangedFlag,
  REGISTRY_ECOSYSTEMS,
  SHARED_FILE_ECOSYSTEMS,
} from "../benchmarks/corpus-affected.js";
import type { CorpusRepositoryEntry } from "../benchmarks/corpus-harness.js";
import { builtInDetectors } from "../src/detectors/index.js";

const names = (paths: string[]) => affectedEcosystems(paths).map((entry) => entry.ecosystem);

test("a change under src/detectors/php runs only the PHP ecosystem", () => {
  assert.deepEqual(names(["src/detectors/php/parse-composer-json.ts"]), ["php"]);
  assert.deepEqual(names(["registry/php.json", "tests/fixtures/php/composer.json"]), ["php"]);
});

test("detectors that serve a different corpus name map to it", () => {
  assert.deepEqual(names(["src/detectors/npm.ts"]), ["node"]);
  assert.deepEqual(names(["registry/nodejs.json"]), ["node"]);
  assert.deepEqual(names(["src/detectors/github-actions.ts"]), ["node-actions"]);
});

test("a shared-file change runs the ecosystems that depend on it", () => {
  assert.deepEqual(names(["src/source-usage.ts"]), [
    "android",
    "dotnet",
    "go",
    "java",
    "node",
    "php",
    "python",
    "ruby",
    "rust",
    "swift",
  ]);
  assert.deepEqual(names(["src/engine.ts"]), [...CORPUS_ECOSYSTEMS]);
  assert.deepEqual(names(["src/detectors/index.ts"]), [...CORPUS_ECOSYSTEMS]);
});

test("unrelated and no-corpus paths map to nothing", () => {
  assert.deepEqual(names(["docs/VALIDATION.md", "src/cli.ts", "registry/cpp.json", "tests/fixtures/dart/x"]), []);
  assert.deepEqual(describeAffected([], 3), ["No corpus ecosystem is affected by the 3 changed files; nothing to run."]);
});

test("the Android detector maps to the android corpus ecosystem", () => {
  assert.deepEqual(names(["src/detectors/android/gradle-scan.ts"]), ["android"]);
  assert.deepEqual(names(["registry/android.json", "tests/fixtures/android/positive/build.gradle"]), ["android"]);
});

test("the reasons name the changed paths", () => {
  const [php] = affectedEcosystems(["src/detectors/php/index.ts", "registry/php.json"]);
  assert.deepEqual(php?.because.map((item) => item.path), ["registry/php.json", "src/detectors/php/index.ts"]);
  assert.match(describeAffected(affectedEcosystems(["registry/php.json"]), 1)[0]!, /^changed: php <- registry\/php\.json \(registry php\.json\)$/);
});

test("--changed takes an optional base", () => {
  assert.deepEqual(parseChangedFlag(["a", "--changed"]), { base: "origin/main" });
  assert.deepEqual(parseChangedFlag(["a", "--changed", "--offline"]), { base: "origin/main" });
  assert.deepEqual(parseChangedFlag(["a", "--changed", "release"]), { base: "release" });
  assert.equal(parseChangedFlag(["a"]), undefined);
});

test("every corpus ecosystem and every built-in detector is covered by the map", async () => {
  const corpus = JSON.parse(await readFile("benchmarks/public-repositories.json", "utf8")) as { repositories: CorpusRepositoryEntry[] };
  const used = new Set(corpus.repositories.map((entry) => entry.ecosystem));
  const mapped = new Set([...Object.values(DETECTOR_ECOSYSTEMS), ...Object.values(REGISTRY_ECOSYSTEMS)].flat());
  for (const ecosystem of used) assert.ok(mapped.has(ecosystem), `corpus ecosystem ${ecosystem} is not reachable from any detector or registry path`);
  for (const ecosystem of mapped) assert.ok((CORPUS_ECOSYSTEMS as readonly string[]).includes(ecosystem), `${ecosystem} is not a corpus ecosystem`);
  assert.deepEqual([...used].sort(), [...CORPUS_ECOSYSTEMS]);

  // cpp is registered before its public corpus. An empty list is that decision; every other built-in must name one.
  // serverless maps to `node` because its reviewed ground truth lives on Node.js corpus entries (serverless.yml).
  const withoutCorpus = new Set(["cpp"]);
  for (const detector of builtInDetectors) {
    const ecosystems = DETECTOR_ECOSYSTEMS[detector.id];
    assert.ok(ecosystems, `built-in detector ${detector.id} has no entry in DETECTOR_ECOSYSTEMS`);
    if (withoutCorpus.has(detector.id)) {
      assert.deepEqual([...ecosystems], [], `${detector.id} has no public corpus yet`);
      continue;
    }
    assert.ok(ecosystems.length > 0, `built-in detector ${detector.id} maps to no corpus ecosystem`);
  }
});

test("every source directory, registry file, and fixture directory is listed, so a new one cannot be skipped", async () => {
  const sources = (await readdir("src/detectors", { withFileTypes: true }))
    .map((entry) => entry.name.replace(/\.ts$/, ""))
    .filter((name) => name !== "index" && name !== "json-lines");
  for (const name of sources) assert.ok(name in DETECTOR_ECOSYSTEMS, `src/detectors/${name} is missing from DETECTOR_ECOSYSTEMS`);
  for (const file of await readdir("registry")) assert.ok(file in REGISTRY_ECOSYSTEMS, `registry/${file} is missing from REGISTRY_ECOSYSTEMS`);
  const detectorFixtures = (await readdir("tests/fixtures", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const name of detectorFixtures.filter((candidate) => candidate in DETECTOR_ECOSYSTEMS && (DETECTOR_ECOSYSTEMS[candidate]?.length ?? 0) > 0)) {
    assert.ok(name in FIXTURE_ECOSYSTEMS, `tests/fixtures/${name} is missing from FIXTURE_ECOSYSTEMS`);
  }
});

test("each shared file lists every ecosystem whose detectors import it", async () => {
  const importers = new Map<string, Set<string>>();
  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...(await walk(path)));
      else if (path.endsWith(".ts")) out.push(path);
    }
    return out;
  }
  for (const file of await walk("src/detectors")) {
    const detector = /^src\/detectors\/([^/]+?)(?:\.ts|\/)/.exec(file)![1]!;
    if (detector === "index") continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/from "((?:\.\.?\/)+)([^"]+?)\.js"/g)) {
      const depth = (match[1]!.match(/\.\.\//g) ?? []).length;
      const fromDir = file.split("/").slice(0, -1);
      const target = [...fromDir.slice(0, fromDir.length - depth), match[2]!].join("/") + ".ts";
      const set = importers.get(target) ?? new Set<string>();
      set.add(detector);
      importers.set(target, set);
    }
  }
  const shared = (path: string) => SHARED_FILE_ECOSYSTEMS.find((entry) => entry.pattern.test(path));
  for (const [target, detectors] of importers) {
    if (!target.startsWith("src/") || target.startsWith("src/detectors/")) {
      if (target !== "src/detectors/json-lines.ts") continue;
    }
    const entry = shared(target);
    assert.ok(entry, `${target} is imported by detectors but has no SHARED_FILE_ECOSYSTEMS entry`);
    for (const detector of detectors) {
      for (const ecosystem of DETECTOR_ECOSYSTEMS[detector] ?? []) {
        assert.ok(entry.ecosystems.includes(ecosystem), `${target} is used by ${detector} but does not list ${ecosystem}`);
      }
    }
  }
});
