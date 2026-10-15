import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { todoCommentsDetector } from "../examples/detectors/todo-comments.js";
import {
  CONFORMANCE_API_VERSION,
  runDetectorConformance,
} from "../src/conformance/index.js";
import { scanRepository } from "../src/engine.js";
import {
  DETECTOR_API_VERSION,
  DetectorCompatibilityError,
  RegistryValidationError,
  defineDetector,
  isDeprecationRule,
  validateRegistry,
} from "../src/sdk.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test("an external detector runs through the public interface", async () => {
  const detector = defineDetector({
    apiVersion: DETECTOR_API_VERSION,
    id: "external-fixture",
    async scan() {
      return [
        {
          id: "external-fixture:one",
          ruleId: "external.one",
          title: "External finding",
          summary: "Produced without editing the scan engine.",
          severity: "medium" as const,
          location: { path: "fixture.txt", line: 1 },
          sources: [{ title: "Fixture source", url: "https://example.com/fixture" }],
        },
      ];
    },
  });

  const result = await scanRepository(".", [detector]);

  assert.equal(result.findings[0]?.detector, "external-fixture");
});

test("the engine rejects incompatible detector versions", async () => {
  const incompatible = {
    apiVersion: "evergreen.detector.v0",
    id: "old-detector",
    async scan() {
      return [];
    },
  };

  await assert.rejects(
    scanRepository(".", [incompatible as never]),
    (error: unknown) =>
      error instanceof DetectorCompatibilityError && /evergreen\.detector\.v1/.test(error.message),
  );
});

test("registry validation checks the envelope, schema, and every rule", () => {
  const definition = {
    schemaVersion: "example.registry.v1",
    isRule: isDeprecationRule,
  };
  const rule = {
    id: "example.rule",
    ecosystem: "example",
    title: "Example rule",
    summary: "Example summary",
    severity: "low",
    migration: {
      constraints: ["Preserve behavior."],
      steps: [
        {
          id: "replace-example",
          title: "Replace example",
          instructions: "Replace the deprecated declaration.",
          targets: "declaration",
        },
      ],
      verification: [{ command: "npm test", purpose: "Run tests." }],
    },
    sources: [{ title: "Example source", url: "https://example.com/rule" }],
  };

  assert.equal(
    validateRegistry({ schemaVersion: "example.registry.v1", rules: [rule] }, definition).rules[0]
      ?.id,
    "example.rule",
  );
  assert.throws(
    () => validateRegistry({ schemaVersion: "example.registry.v0", rules: [rule] }, definition),
    RegistryValidationError,
  );
  assert.throws(
    () => validateRegistry({ schemaVersion: "example.registry.v1", rules: [{}] }, definition),
    /index 0/,
  );
  assert.equal(
    isDeprecationRule({ ...rule, migration: { ...rule.migration, verification: [] } }),
    false,
  );
});

test("the documented example detector remains compatible", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-sdk-example-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "TODO.md"), "active\nDEPRECATED: replace this\n");

  assert.equal(CONFORMANCE_API_VERSION, DETECTOR_API_VERSION);
  await runDetectorConformance({
    detector: todoCommentsDetector,
    fixtures: [
      {
        name: "documented TODO detector",
        root,
        expectedFindings: [
          {
            id: "todo-comments:deprecated:2",
            ruleId: "todo-comments.deprecated",
            title: "Deprecated TODO entry",
            summary: "DEPRECATED: replace this",
            severity: "low",
            location: { path: "TODO.md", line: 2 },
            sources: [
              {
                title: "Repository TODO policy",
                url: "https://example.com/todo-policy",
              },
            ],
          },
        ],
      },
    ],
  });
});
