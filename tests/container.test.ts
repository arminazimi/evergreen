import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { containerDetector } from "../src/detectors/container/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/container");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-container-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function expected(ruleId: string, path: string, line: number, value: string): Promise<DetectorFinding> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8")));
  const rule = registry.rules.find((item) => item.id === ruleId)!;
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: `${path} uses ${value}. ${rule.summary}`,
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    deadline: rule.deadline!,
    migration: rule.migration!,
    sources: rule.sources,
  };
}

test("container passes detector conformance on every fixture", async () => {
  const node = "container.node.eol-21-and-older";
  const postgres = "container.postgres.eol-13-and-older";
  await runDetectorConformance({
    detector: containerDetector,
    fixtures: [
      {
        name: "container positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          expected(postgres, "api.Dockerfile", 1, "postgres:11.5-bullseye"),
          expected(postgres, "compose.yaml", 3, "postgres:11"),
          expected(node, "docker-compose.yml", 3, "docker.io/library/node:16-alpine"),
          expected(node, "Dockerfile", 2, "node:16"),
          expected(node, "Dockerfile", 5, "node:16-alpine"),
          expected("container.python.eol-3.10-and-older", "Dockerfile", 8, "docker.io/library/python:3.8-slim"),
          expected("container.redis.eol-6.0-and-older", "compose.yaml", 5, "redis:5-alpine"),
          expected("container.redis.eol-6.0-and-older", "Containerfile", 1, "redis:5@sha256:0000000000000000000000000000000000000000000000000000000000000000"),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck],
  });
  await runDetectorConformance({
    detector: containerDetector,
    fixtures: [{ name: "container negative", root: resolve(fixtures, "negative"), expectedFindings: [] }],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: containerDetector,
    fixtures: [{ name: "container zero", root: resolve(fixtures, "zero"), expectedFindings: [] }],
    checks: [zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: containerDetector,
    fixtures: [{ name: "container malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("dynamic, untagged, and floating references are reported as unclassified, never guessed", async () => {
  const analysis = await containerDetector.analyze({ root: resolve(fixtures, "negative") });
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reference]),
    [
      ["compose.yaml", 8, "node:latest"],
      ["Dockerfile", 2, "node:${NODE_VERSION}"],
      ["Dockerfile", 4, "node:latest"],
      ["Dockerfile", 5, "node"],
      ["Dockerfile", 6, `node@sha256:${"0".repeat(64)}`],
    ],
  );
});

test("a floating tag that spans supported and unsupported versions is unclassified", async () => {
  const root = await repository({
    Dockerfile: "FROM mysql:8\nFROM mysql:8.0\nFROM mysql:8.4\nFROM python:3\nFROM node:20-custom-build\nFROM node:20-alpine3.19\n",
  });
  const analysis = await containerDetector.analyze({ root });
  assert.deepEqual(
    analysis.findings.map((finding) => [finding.ruleId, finding.location.line]),
    [
      ["container.mysql.eol-8.0-and-older", 2],
      ["container.node.eol-21-and-older", 6],
    ],
  );
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.location.line, item.reference]),
    [
      [1, "mysql:8"],
      [4, "python:3"],
      [5, "node:20-custom-build"],
    ],
  );
});

test("only Docker Hub official images are matched, other registries are not", async () => {
  const root = await repository({ Dockerfile: "FROM ghcr.io/acme/node:16\nFROM myorg/node:16\nFROM registry.example.com/node:16\n" });
  assert.deepEqual(await containerDetector.analyze({ root }), { findings: [], unclassified: [] });
});

test("skips dependency directories and symbolic links, and finds nested files", async () => {
  const root = await repository({
    "services/api/Dockerfile": "FROM node:18\n",
    "node_modules/pkg/Dockerfile": "FROM node:18\n",
  });
  await symlink(join(root, "services"), join(root, "linked")).catch(() => undefined);
  const findings = await containerDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => finding.location.path), ["services/api/Dockerfile"]);
});

test("a repository with no container files scans to nothing without reading the registry", async () => {
  const root = await repository({ "README.md": "hello\n" });
  assert.deepEqual(await containerDetector.analyze({ root }), { findings: [], unclassified: [] });
});

test("test fixture directories are not scanned", async () => {
  const root = await repository({ "tests/fixtures/old/Dockerfile": "FROM node:16\n", "docker/Dockerfile": "FROM node:16\n" });
  assert.deepEqual((await containerDetector.scan({ root })).map((finding) => finding.location.path), ["docker/Dockerfile"]);
});

import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";

test("every curated container rule has migration guidance with real verification commands", async () => {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8")));
  for (const rule of registry.rules) {
    assert.ok(rule.migration, rule.id);
    assert.ok(rule.migration.constraints.length >= 1, rule.id);
    assert.ok(rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.length >= 1, rule.id);
    for (const check of rule.migration.verification) assert.match(check.command, /^docker /, rule.id);
  }
});

test("a migration packet for a container finding names the file, steps, and verification", async () => {
  const root = resolve(fixtures, "positive");
  const result = await scanRepository(root, [containerDetector]);
  const finding = result.findings.find((item) => item.id === "container.node.eol-21-and-older:Dockerfile:2");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("Dockerfile"));
  assert.ok(packet.steps.some((step) => step.id === "update-image-declaration"));
  assert.ok(packet.verification.some((check) => check.command === "docker build ."));
});
