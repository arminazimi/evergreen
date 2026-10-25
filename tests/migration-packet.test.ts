import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";

const result: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repo",
  scannedAt: "2026-10-14T07:00:00.000Z",
  diagnostics: [],
  findings: [
    {
      id: "npm.request:package.json:3",
      ruleId: "npm.request",
      detector: "npm",
      title: "Deprecated request package",
      summary: "request is deprecated.",
      severity: "high",
      confidence: "exact",
      location: { path: "package.json", line: 3 },
      replacement: "Native fetch",
      deadline: "2020-02-11",
      sources: [{ title: "Official notice", url: "https://example.com/request" }],
      usages: [
        {
          kind: "import",
          language: "typescript",
          symbol: "request",
          location: { path: "src/client.ts", line: 1, column: 28 },
          excerpt: 'import request from "request";',
        },
        {
          kind: "call",
          language: "typescript",
          symbol: "request.get",
          location: { path: "src/client.ts", line: 2, column: 1 },
          excerpt: "request.get(url);",
        },
      ],
      impact: { usageCount: 2, affectedFiles: 1, level: "low" },
    },
  ],
};

test("creates a deterministic, agent-ready migration packet", () => {
  const packet = createMigrationPacket(result, "npm.request:package.json:3");

  assert.equal(packet.schemaVersion, "evergreen.context.v1");
  assert.equal(packet.generatedAt, result.scannedAt);
  assert.deepEqual(packet.affectedFiles, ["package.json", "src/client.ts"]);
  assert.equal(packet.usages.length, 2);
  assert.match(packet.constraints.join("\n"), /Target replacement: Native fetch/);
  assert.deepEqual(packet.steps.map((step) => step.id), [
    "review-evidence",
    "update-declaration",
    "migrate-usages",
    "verify-migration",
  ]);
  assert.deepEqual(packet.verification.map((item) => item.command), [
    "npm run test --if-present",
    "npm run build --if-present",
    "evergreen scan . --json",
  ]);
  assert.deepEqual(createMigrationPacket(result, packet.finding.id), packet);
});

test("rejects a missing finding", () => {
  assert.throws(() => createMigrationPacket(result, "missing"), /Finding not found: missing/);
});

test("validates packets and keeps the JSON Schema top-level contract in sync", async () => {
  const packet = createMigrationPacket(result, result.findings[0]!.id);
  assert.equal(
    validateMigrationPacket(JSON.parse(JSON.stringify(packet))).schemaVersion,
    packet.schemaVersion,
  );
  assert.throws(
    () => validateMigrationPacket({ ...packet, schemaVersion: "evergreen.context.v2" }),
    /Unsupported migration packet schema/,
  );
  assert.throws(
    () => validateMigrationPacket({ ...packet, verification: [] }),
    /Invalid migration steps or verification commands/,
  );
  assert.throws(
    () => validateMigrationPacket({ ...packet, affectedFiles: ["package.json"] }),
    /evidence is inconsistent/,
  );
  assert.throws(
    () => validateMigrationPacket({ ...packet, sources: [] }),
    /Invalid migration packet scope or evidence/,
  );

  const schema = JSON.parse(
    await readFile(resolve("schemas/context.v1.schema.json"), "utf8"),
  ) as { required: string[] };
  assert.deepEqual([...schema.required].sort(), Object.keys(packet).sort());
});

test("warns when the pinned runtime is below what the replacement requires", () => {
  const withRequirement: ScanResult = {
    ...result,
    findings: [{ ...result.findings[0]!, requires: { node: "18.0.0", python: "3.9" } }],
  };
  const id = withRequirement.findings[0]!.id;

  const warned = createMigrationPacket(withRequirement, id, [], { node: "v16.20.0", python: "3.12.1" });
  const warnings = warned.constraints.filter((line) => line.startsWith("Warning:"));
  assert.deepEqual(warnings, [
    "Warning: Native fetch requires Node.js 18.0.0 or newer, but this repository pins Node.js v16.20.0. Upgrade the runtime first or choose another replacement.",
  ]);

  for (const pinned of [{ node: "18" }, { node: "lts/*" }, {}]) {
    const quiet = createMigrationPacket(withRequirement, id, [], pinned);
    assert.equal(quiet.constraints.some((line) => line.startsWith("Warning:")), false);
  }
  assert.equal(createMigrationPacket(result, result.findings[0]!.id, [], { node: "12" }).constraints.some((line) => line.startsWith("Warning:")), false);
});
