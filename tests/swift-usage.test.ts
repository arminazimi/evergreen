import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { SwiftDetector } from "../src/detectors/swift/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage, findSwiftDynamicReferences } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-swift-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const usage = [
  { kind: "import" as const, language: "swift" as const, module: "ExampleLibrary" },
  { kind: "call" as const, language: "swift" as const, module: "ExampleLibrary", targets: ["Client.request"] },
];

const packageRule: RegistryV2Rule = {
  id: "swift.package.example-library.deprecated",
  ecosystem: "swift",
  purl: "pkg:swift/example-library",
  vers: "vers:semver/<2.0.0",
  event: "deprecated",
  title: "example-library 1.x is deprecated",
  summary: "The maintainer archived the package.",
  severity: "medium",
  replacement: "example-library 2",
  sources: [{ title: "Example archive notice", url: "https://example.com/example-library" }],
  provenance: { observedAt: "2026-10-20", reviewedAt: "2026-10-20", reviewer: "test" },
  migration: {
    constraints: ["Keep the package and source imports on the same major version."],
    steps: [{ id: "replace-api", title: "Replace the API", instructions: "Update the package and affected calls.", targets: "all" }],
    verification: [{ command: "swift build && swift test", purpose: "Build and test the Swift package." }],
  },
  usage,
};

test("reports Swift imports, source aliases, and module-qualified calls", async () => {
  const root = await repository({
    "Sources/App.swift": [
      "@testable import ExampleLibrary",
      "typealias LegacyClient = ExampleLibrary.Client",
      "ExampleLibrary.Client.request()",
      "LegacyClient.request()",
      "// ExampleLibrary.Client.request()",
      'let text = "ExampleLibrary.Client.request()"',
      'let prose = """',
      "ExampleLibrary.Client.request()",
      '"""',
      "/* outer /* inner */",
      "ExampleLibrary.Client.request()",
      "*/",
    ].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, [{ id: "example", matchers: usage }]);
  assert.deepEqual(
    analysis!.usages.map((item) => [item.kind, item.location.line, item.symbol]),
    [
      ["import", 1, "ExampleLibrary"],
      ["call", 3, "ExampleLibrary.Client.request"],
      ["call", 4, "ExampleLibrary.Client.request"],
    ],
  );
  assert.deepEqual(analysis!.impact, { usageCount: 3, affectedFiles: 1, level: "low" });
});

test("reports runtime lookup forms as unclassified and ignores comments", async () => {
  const root = await repository({
    "Sources/Dynamic.swift": [
      "let type = NSClassFromString(runtimeName)",
      "let symbol = dlsym(handle, symbolName)",
      "worker.perform(task)",
      "// NSProtocolFromString(name)",
    ].join("\n"),
  });
  assert.deepEqual(
    (await findSwiftDynamicReferences(root)).map((item) => [item.line, item.column, item.reference]),
    [
      [1, 12, "let type = NSClassFromString(runtimeName)"],
      [2, 14, "let symbol = dlsym(handle, symbolName)"],
    ],
  );
});

test("Swift matchers are valid usage matchers", () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "swift", module: "ExampleLibrary" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "swift", module: "ExampleLibrary", targets: ["Client.request"] }), true);
});

test("a deprecated Swift package includes source usage in scan output and migration context", async () => {
  const root = await repository({
    "Package.swift": [
      "// swift-tools-version: 5.9",
      "import PackageDescription",
      "let package = Package(",
      '  name: "Fixture",',
      "  dependencies: [",
      '    .package(url: "https://github.com/acme/example-library.git", exact: "1.4.0"),',
      "  ]",
      ")",
    ].join("\n"),
    "Sources/App.swift": [
      "import ExampleLibrary",
      "typealias LegacyClient = ExampleLibrary.Client",
      "LegacyClient.request()",
    ].join("\n"),
    "Sources/Dynamic.swift": "let type = NSClassFromString(runtimeName)\n",
  });
  const result = await scanRepository(root, [new SwiftDetector(async () => [packageRule])]);
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0]!;
  assert.deepEqual(
    finding.usages?.map((item) => [item.kind, item.location.path, item.location.line]),
    [
      ["import", "Sources/App.swift", 1],
      ["call", "Sources/App.swift", 3],
    ],
  );
  assert.deepEqual(finding.impact, { usageCount: 2, affectedFiles: 1, level: "low" });
  assert.deepEqual(result.unclassified?.references.map((item) => [item.location.path, item.location.line]), [["Sources/Dynamic.swift", 1]]);

  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual(packet.affectedFiles, ["Package.swift", "Sources/App.swift"]);
  assert.equal(packet.usages.length, 2);
  assert.ok(packet.verification.some((item) => item.command === "swift build && swift test"));
});
