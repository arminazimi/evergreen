import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { GoDetector } from "../src/detectors/go/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-go-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const contract = [
  {
    id: "old",
    matchers: [
      { kind: "import" as const, language: "go" as const, module: "example.com/old" },
      { kind: "call" as const, language: "go" as const, module: "example.com/old", targets: ["Do", "Run"] },
    ],
  },
];

test("reports single and grouped imports, aliases, and calls with exact lines", async () => {
  const root = await repository({
    "main.go": [
      "package main",
      "",
      'import "example.com/old"',
      "",
      "func main() {",
      "\told.Do()",
      "\told.Other()",
      "}",
    ].join("\n"),
    "svc/svc.go": [
      "package svc",
      "",
      "import (",
      '\t"fmt"',
      '\tlegacy "example.com/old/sub"',
      '\t_ "example.com/old/side"',
      ")",
      "",
      'func f() { legacy.Run(); fmt.Println("old.Do()") }',
    ].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(
    analysis!.usages.map((usage) => [usage.kind, usage.location.path, usage.location.line, usage.symbol]),
    [
      ["import", "main.go", 3, "example.com/old"],
      ["call", "main.go", 6, "example.com/old.Do"],
      ["import", "svc/svc.go", 5, "example.com/old"],
      ["import", "svc/svc.go", 6, "example.com/old"],
      ["call", "svc/svc.go", 9, "example.com/old.Run"],
    ],
  );
  assert.deepEqual(analysis!.impact, { usageCount: 5, affectedFiles: 2, level: "medium" });
});

test("a major-version suffix binds the previous path element, and comments and strings are ignored", async () => {
  const root = await repository({
    "a.go": ['package a', '', 'import "example.com/old/v2"', '// old.Do() in a comment', 'var s = "old.Do()"', 'func f() { old.Do() }'].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(analysis!.usages.map((usage) => [usage.kind, usage.location.line]), [["import", 3], ["call", 6]]);
});

test("dot imports and blank imports count as imports but bind no name, so calls are not guessed", async () => {
  const root = await repository({ "a.go": ['package a', '', 'import (', '\t. "example.com/old"', ')', 'func f() { Do() }'].join("\n") });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(analysis!.usages.map((usage) => usage.kind), ["import"]);
});

test("a commented-out import and an unrelated package are not usages", async () => {
  const root = await repository({ "a.go": ['package a', '', 'import (', '\t// "example.com/old"', '\t"example.com/older"', ')'].join("\n") });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(analysis!.usages, []);
});

test("Go matchers are valid usage matchers", () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "go", module: "example.com/old" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "go", module: "example.com/old", targets: ["Do"] }), true);
  assert.equal(isUsageMatcher({ kind: "import", language: "swift", module: "x" }), false);
});

const moduleRule: RegistryV2Rule = {
  id: "go.module.example-old.deprecated",
  ecosystem: "go",
  purl: "pkg:golang/example.com/old",
  vers: "vers:golang/<2.0.0",
  event: "deprecated",
  title: "example.com/old is deprecated",
  summary: "The module is deprecated in favour of example.com/new.",
  severity: "medium",
  replacement: "example.com/new",
  sources: [{ title: "Module deprecation notice", url: "https://example.com/old/blob/main/go.mod" }],
  provenance: { observedAt: "2026-10-17", reviewedAt: "2026-10-17", reviewer: "test" },
  migration: {
    constraints: ["Keep every package on one module."],
    steps: [{ id: "swap-module", title: "Swap the module", instructions: "Replace the import path.", targets: "all" }],
    verification: [{ command: "go build ./... && go test ./...", purpose: "Build and test everything." }],
  },
  usage: [
    { kind: "import", language: "go", module: "example.com/old" },
    { kind: "call", language: "go", module: "example.com/old", targets: ["Do"] },
  ],
};

test("a deprecated direct module is reported with where the source uses it, and in the migration packet", async () => {
  const root = await repository({
    "go.mod": "module example.com/app\n\ngo 1.27\n\nrequire example.com/old v1.4.0\n",
    "main.go": ['package main', '', 'import "example.com/old"', '', 'func main() { old.Do() }'].join("\n"),
  });
  const detector = new GoDetector(async () => [moduleRule]);
  const result = await scanRepository(root, [detector]);
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0]!;
  assert.equal(finding.id, "go.module.example-old.deprecated:go.mod:5");
  assert.deepEqual(finding.usages?.map((usage) => [usage.location.path, usage.location.line, usage.kind]), [["main.go", 3, "import"], ["main.go", 5, "call"]]);
  assert.deepEqual(finding.impact, { usageCount: 2, affectedFiles: 1, level: "low" });
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual([...packet.affectedFiles].sort(), ["go.mod", "main.go"]);
  assert.equal(packet.usages.length, 2);
});

test("a module at a version outside the rule's range is not reported", async () => {
  const root = await repository({ "go.mod": "module example.com/app\n\ngo 1.27\n\nrequire example.com/old v2.1.0\n" });
  assert.deepEqual(await new GoDetector(async () => [moduleRule]).scan({ root }), []);
});
