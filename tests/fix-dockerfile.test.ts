import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine/index.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { dockerfileBaseImageFixer } from "../src/fix/dockerfile.js";

const fixtures = resolve("tests/fixtures/fix-dockerfile");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-dockerfile-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

function reasonOf(
  refusals: Array<{ path: string; line: number | undefined; reason: string }>,
  path: string,
  line: number,
): string | undefined {
  return refusals.find((refusal) => refusal.path === path && refusal.line === line)?.reason;
}

test("the fixer output matches the after fixture and refuses ambiguous, distro-changing and digest-pinned images", async () => {
  const before = await readFile(join(fixtures, "before.image.fixture"), "utf8");
  const after = await readFile(join(fixtures, "after.image.fixture"), "utf8");
  const compose = "services:\n  web:\n    image: node:20\n";
  const root = await repository({ Dockerfile: before, "deploy/compose.yaml": compose });
  const refusals: Array<{ path: string; line: number | undefined; reason: string }> = [];
  const patches = await dockerfileBaseImageFixer.plan(await scanRepository(root, detectors), (finding, reason) =>
    refusals.push({ path: finding.location.path, line: finding.location.line, reason }),
  );

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "Dockerfile");
  // renderDiff emits one hunk spanning the first to the last change, so rebuild the new side of it and compare with the fixture.
  const hunk = patches[0]!.diff.split("\n").slice(2);
  const start = Number(/^@@ -(\d+)/.exec(hunk[0]!)![1]) - 1;
  const rebuilt = hunk
    .slice(1)
    .filter((line) => !line.startsWith("-"))
    .map((line) => line.slice(1));
  assert.deepEqual(rebuilt, after.split("\n").slice(start, start + rebuilt.length));
  assert.ok(patches[0]!.diff.includes("\n-FROM node:20 AS build\n"));
  assert.ok(patches[0]!.diff.includes("\n+FROM node:22 AS build\n"));
  assert.ok(patches[0]!.diff.includes("\n+FROM --platform=linux/amd64 node:22 AS runtime\n"));

  assert.equal(reasonOf(refusals, "Dockerfile", 9), "The rule's replacement does not name a tag for this image.");
  assert.equal(
    reasonOf(refusals, "Dockerfile", 12),
    'The rule\'s replacement tag "22" is not in the same distro family as "20-alpine".',
  );
  assert.equal(
    reasonOf(refusals, "Dockerfile", 15),
    "The image is pinned by digest; rewriting the tag would leave the digest pointing at the old image.",
  );
  // A Compose image is not a Dockerfile FROM line, so the fixer leaves it alone rather than refusing it.
  assert.equal(
    refusals.some((refusal) => refusal.path.startsWith("deploy/")),
    false,
  );
  assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), before);
  assert.equal(await readFile(join(root, "deploy", "compose.yaml"), "utf8"), compose);
});

test("the planned patch is idempotent: scanning the fixed file plans nothing", async () => {
  const root = await repository({ Dockerfile: await readFile(join(fixtures, "after.image.fixture"), "utf8") });
  assert.deepEqual(await dockerfileBaseImageFixer.plan(await scanRepository(root, detectors)), []);
});

test("a supported release line with a scheduled end of life is left alone", async () => {
  const root = await repository({ Dockerfile: "FROM node:22\n" });
  const refusals: string[] = [];
  const patches = await dockerfileBaseImageFixer.plan(await scanRepository(root, detectors), (_, reason) =>
    refusals.push(reason),
  );
  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, []);
});

test("a scheduled .NET image end of support is left alone", async () => {
  const root = await repository({ Dockerfile: "FROM mcr.microsoft.com/dotnet/sdk:8.0\n" });
  const refusals: string[] = [];
  const patches = await dockerfileBaseImageFixer.plan(await scanRepository(root, detectors), (_, reason) =>
    refusals.push(reason),
  );
  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, []);
});

test("a replacement that names more than one tag is refused", async () => {
  const root = await repository({ Dockerfile: "FROM node:20\n" });
  const scan = await scanRepository(root, detectors);
  const finding = scan.findings.find((item) => item.ruleId.startsWith("container.node."))!;
  const refusals: string[] = [];
  const patches = await dockerfileBaseImageFixer.plan(
    { ...scan, findings: [{ ...finding, replacement: "A node image such as node:22 or node:24" }] },
    (_, reason) => refusals.push(reason),
  );
  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, ["The rule's replacement names more than one tag; the target is ambiguous."]);
});

test("a Dockerfile without a trailing newline is left alone", async () => {
  const root = await repository({ Dockerfile: "FROM node:20" });
  const refusals: string[] = [];
  const patches = await dockerfileBaseImageFixer.plan(await scanRepository(root, detectors), (_, reason) =>
    refusals.push(reason),
  );
  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, ["The Dockerfile does not end with a newline."]);
});

test("the fixer refuses each unrewritable image with its own reason and never guesses a target", async () => {
  const root = await repository({
    Dockerfile: [
      "FROM node:22-alpine AS newer",
      "FROM node AS untagged",
      "FROM node:20 AS ambiguous",
      "FROM node:lts AS floating",
      "FROM node:20 AS unlined",
      "",
    ].join("\n"),
  });
  const finding = (line: number | undefined, summary: string, replacement: string): Finding =>
    ({
      id: `f${line ?? "none"}`,
      ruleId: "container.image.end-of-life",
      detector: "container",
      title: "Base image is end of life",
      summary,
      severity: "high",
      confidence: "exact",
      location: { path: "Dockerfile", ...(line === undefined ? {} : { line }) },
      replacement,
      sources: [],
    }) as Finding;
  const result = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-11-06T00:00:00.000Z",
    diagnostics: [],
    findings: [
      finding(1, "The base image uses node:22-alpine. Upgrade it.", "Use node:21-alpine"),
      finding(2, "The base image uses node. Upgrade it.", "Use node:22"),
      finding(3, "The base image uses node:20. Upgrade it.", "Use node:22 or node:24"),
      finding(4, "The base image uses node:lts. Upgrade it.", "Use node:22"),
      finding(undefined, "The base image uses node:20. Upgrade it.", "Use node:22"),
    ],
  } as ScanResult;
  const refusals: Array<{ line: number | undefined; reason: string }> = [];
  const patches = await dockerfileBaseImageFixer.plan(result, (found, reason) =>
    refusals.push({ line: found.location.line, reason }),
  );

  assert.deepEqual(patches, []);
  assert.equal(
    refusals.find((refusal) => refusal.line === 1)?.reason,
    'The rule\'s replacement tag "21-alpine" is not newer than the current tag "22-alpine".',
  );
  assert.equal(refusals.find((refusal) => refusal.line === 2)?.reason, "The image has no tag to rewrite.");
  assert.equal(
    refusals.find((refusal) => refusal.line === 3)?.reason,
    "The rule's replacement names more than one tag; the target is ambiguous.",
  );
  assert.equal(refusals.find((refusal) => refusal.line === 4)?.reason, "The image tag does not name a release line.");
  assert.equal(refusals.find((refusal) => refusal.line === undefined)?.reason, "The finding names no line to rewrite.");
});
