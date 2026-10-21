import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { DartDetector } from "../src/detectors/dart/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage, findDartDynamicReferences } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-dart-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const usage = [
  { kind: "import" as const, language: "dart" as const, module: "example_widgets" },
  { kind: "call" as const, language: "dart" as const, module: "example_widgets", targets: ["fetch", "Client"] },
];

const packageRule: RegistryV2Rule = {
  id: "dart.package.example-widgets.discontinued",
  ecosystem: "dart",
  purl: "pkg:pub/example_widgets",
  vers: "vers:semver/*",
  event: "deprecated",
  title: "example_widgets is discontinued",
  summary: "The publisher discontinued the package on pub.dev.",
  severity: "medium",
  replacement: "example_widgets_plus",
  sources: [{ title: "pub.dev package page", url: "https://pub.dev/packages/example_widgets" }],
  provenance: { observedAt: "2026-10-21", reviewedAt: "2026-10-21", reviewer: "test" },
  migration: {
    constraints: ["Keep pubspec.yaml and the imports on the same package."],
    steps: [{ id: "replace-api", title: "Replace the API", instructions: "Switch to example_widgets_plus.", targets: "all" }],
    verification: [{ command: "dart analyze && flutter test", purpose: "Analyze and test the Flutter app." }],
  },
  usage,
};

test("reports package imports, prefixed calls, and calls of shown names", async () => {
  const root = await repository({
    "lib/main.dart": [
      "import 'package:example_widgets/example_widgets.dart' as ew;",
      "import 'package:example_widgets/more.dart' show Client, Other;",
      "import 'package:other_package/other.dart' as other;",
      "import 'dart:async';",
      "import '../local.dart';",
      "void main() {",
      "  ew.fetch(url);",
      "  final client = Client();",
      "  other.fetch(url);",
      "  // ew.fetch(url);",
      "  final text = 'ew.fetch(url)';",
      "}",
    ].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, [{ id: "example", matchers: usage }]);
  assert.deepEqual(
    analysis!.usages.map((item) => [item.kind, item.location.line, item.symbol]),
    [
      ["import", 1, "example_widgets"],
      ["import", 2, "example_widgets"],
      ["call", 7, "example_widgets.fetch"],
      ["call", 8, "example_widgets.Client"],
    ],
  );
  assert.deepEqual(analysis!.impact, { usageCount: 4, affectedFiles: 1, level: "medium" });
});

test("a bare import and an unrelated prefix do not attribute unqualified calls", async () => {
  const root = await repository({
    "lib/a.dart": ["import 'package:example_widgets/example_widgets.dart';", "void main() { fetch(url); }"].join("\n"),
    "lib/b.dart": ["import 'package:example_widgets/example_widgets.dart' hide Client;", "void main() { Client(); }"].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, [{ id: "example", matchers: usage }]);
  assert.deepEqual(
    analysis!.usages.map((item) => [item.kind, item.location.path, item.location.line]),
    [
      ["import", "lib/a.dart", 1],
      ["import", "lib/b.dart", 1],
    ],
  );
});

test("reads deferred prefixes and imports that continue on the next line", async () => {
  const root = await repository({
    "lib/main.dart": [
      "import 'package:example_widgets/example_widgets.dart'",
      "    deferred as ew;",
      "void main() { ew.fetch(url); }",
    ].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, [{ id: "example", matchers: usage }]);
  assert.deepEqual(analysis!.usages.map((item) => [item.kind, item.location.line]), [["import", 1], ["call", 3]]);
});

test("a dart: library is matched by its full name", async () => {
  const root = await repository({ "lib/main.dart": "import 'dart:html' as html;\nvoid main() { html.window.alert('x'); }\n" });
  const [analysis] = await analyzeSourceUsage(root, [
    { id: "html", matchers: [{ kind: "import", language: "dart", module: "dart:html" }, { kind: "call", language: "dart", module: "dart:html", targets: ["window.alert"] }] },
  ]);
  assert.deepEqual(analysis!.usages.map((item) => [item.kind, item.symbol]), [["import", "dart:html"], ["call", "dart:html.window.alert"]]);
});

test("reports Function.apply and dart:mirrors reflection as unclassified and ignores comments", async () => {
  const root = await repository({
    "lib/dynamic.dart": [
      "import 'dart:mirrors';",
      "void main() {",
      "  Function.apply(callback, args);",
      "  final mirror = reflect(object);",
      "  // Function.apply(callback, args);",
      "}",
    ].join("\n"),
    "lib/plain.dart": "void main() { reflect(object); }\n",
  });
  assert.deepEqual(
    (await findDartDynamicReferences(root)).map((item) => [item.path, item.line, item.column, item.reference]),
    [
      ["lib/dynamic.dart", 3, 3, "Function.apply(callback, args);"],
      ["lib/dynamic.dart", 4, 18, "final mirror = reflect(object);"],
    ],
  );
});

test("Dart matchers are valid usage matchers", () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "dart", module: "example_widgets" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "dart", module: "example_widgets", targets: ["fetch"] }), true);
});

test("a discontinued Dart package includes source usage in scan output and migration context", async () => {
  const root = await repository({
    "pubspec.yaml": "name: app\ndependencies:\n  example_widgets: ^2.1.0\n",
    "lib/main.dart": ["import 'package:example_widgets/example_widgets.dart' as ew;", "void main() { ew.fetch(url); }"].join("\n"),
    "lib/dynamic.dart": "void main() { Function.apply(callback, args); }\n",
  });
  const result = await scanRepository(root, [new DartDetector(async () => [packageRule])]);
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0]!;
  assert.deepEqual(
    finding.usages?.map((item) => [item.kind, item.location.path, item.location.line]),
    [
      ["import", "lib/main.dart", 1],
      ["call", "lib/main.dart", 2],
    ],
  );
  assert.deepEqual(finding.impact, { usageCount: 2, affectedFiles: 1, level: "low" });
  assert.deepEqual(result.unclassified?.references.map((item) => [item.location.path, item.location.line]), [["lib/dynamic.dart", 1]]);

  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual(packet.affectedFiles, ["lib/main.dart", "pubspec.yaml"]);
  assert.equal(packet.usages.length, 2);
  assert.ok(packet.verification.some((item) => item.command === "dart analyze && flutter test"));
});
