import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGraph,
  compare,
  findCycles,
  findViolations,
  importSpecifiers,
  loadSources,
  main,
} from "../tools/check-architecture.js";

test("importSpecifiers reads static, re-export and dynamic imports", () => {
  const source = [
    'import { a } from "./a.js";',
    'export * from "./b.js";',
    'const c = await import("./c.js");',
    'import "node:fs";',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["./a.js", "./b.js", "./c.js", "node:fs"]);
});

test("a forbidden import is reported", () => {
  const graph = buildGraph(
    new Map([
      ["src/engine/detect.ts", 'import { d } from "../detectors/npm/index.js";'],
      ["src/detectors/npm/index.ts", 'import https from "node:https";'],
    ]),
  );
  assert.deepEqual(findViolations(graph), [
    "detectors-no-network: src/detectors/npm/index.ts -> node:https",
    "engine-no-detectors: src/engine/detect.ts -> src/detectors/npm/index.ts",
  ]);
});

test("cycles are found and acyclic graphs are clean", () => {
  const cyclic = buildGraph(
    new Map([
      ["src/a.ts", 'import "./b.js";'],
      ["src/b.ts", 'import "./a.js";'],
      ["src/c.ts", 'import "./a.js";'],
    ]),
  );
  assert.deepEqual(findCycles(cyclic), ["src/a.ts <-> src/b.ts"]);
  const acyclic = buildGraph(
    new Map([
      ["src/a.ts", 'import "./b.js";'],
      ["src/b.ts", ""],
    ]),
  );
  assert.deepEqual(findCycles(acyclic), []);
});

test("compare flags new findings and stale baseline entries", () => {
  const result = compare({ violations: ["new"], cycles: ["x <-> y"] }, { violations: ["old"], cycles: ["x <-> y"] });
  assert.deepEqual(result.added, ["new"]);
  assert.deepEqual(result.stale, ["old"]);
});

test("the repository matches its architecture baseline", () => {
  assert.equal(loadSources(process.cwd()).has("src/engine/index.ts"), true);
  assert.equal(main([]), 0);
});

test("domain, SDK, and core may not import the filesystem or network modules", () => {
  const graph = buildGraph(
    new Map([
      ["src/engine/report.ts", 'import { readFile } from "node:fs/promises";'],
      ["src/usage/walk.ts", 'import { get } from "node:https";'],
      ["src/node-file-system.ts", 'import { readFile } from "node:fs/promises";'],
    ]),
  );
  assert.deepEqual(findViolations(graph), [
    "core-no-fs-or-network: src/engine/report.ts -> node:fs/promises",
    "core-no-fs-or-network: src/usage/walk.ts -> node:https",
  ]);
});
