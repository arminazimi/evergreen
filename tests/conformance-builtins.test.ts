import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { declaredInputsCheck } from "../src/conformance/checks/inputs.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { ConformanceError, runDetectorConformance } from "../src/conformance/index.js";
import type { ConformanceCheck } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { confidenceValues, severityValues } from "../src/domain.js";
import { restoreFixtureNames } from "../src/fixture-names.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector, DetectorFinding, DetectorInputs } from "../src/sdk.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const severities = new Set<string>(severityValues);
const confidences = new Set<string>(confidenceValues);

/** Fails with the first field a finding gets wrong, so a broken detector is recognizable from the message alone. */
function assertWellFormedFinding(finding: DetectorFinding): void {
  assert.ok(finding && typeof finding === "object", "a finding must be an object");
  assert.ok(typeof finding.id === "string" && finding.id.trim().length > 0, "a finding must have a non-empty id");
  assert.ok(
    typeof finding.ruleId === "string" && finding.ruleId.trim().length > 0,
    `finding "${finding.id}" must name the rule it came from`,
  );
  assert.ok(
    typeof finding.title === "string" && finding.title.trim().length > 0,
    `finding "${finding.id}" must have a title`,
  );
  assert.ok(
    typeof finding.summary === "string" && finding.summary.trim().length > 0,
    `finding "${finding.id}" must have a summary`,
  );
  assert.ok(severities.has(finding.severity), `finding "${finding.id}" has an unknown severity: ${finding.severity}`);
  assert.ok(
    finding.confidence === undefined || confidences.has(finding.confidence),
    `finding "${finding.id}" has an unknown confidence: ${String(finding.confidence)}`,
  );
  assert.ok(
    finding.location && typeof finding.location.path === "string" && finding.location.path.trim().length > 0,
    `finding "${finding.id}" has an empty location path`,
  );
  assert.ok(
    typeof finding.location.line === "number" && Number.isInteger(finding.location.line) && finding.location.line > 0,
    `finding "${finding.id}" does not have a 1-based line`,
  );
  assert.ok(Array.isArray(finding.sources), `finding "${finding.id}" must carry sources`);
  for (const source of finding.sources) {
    assert.ok(
      typeof source.title === "string" && source.title.trim().length > 0,
      `finding "${finding.id}" has a source without a title`,
    );
    assert.ok(
      typeof source.url === "string" && source.url.trim().length > 0,
      `finding "${finding.id}" has a source without a URL`,
    );
  }
}

/** The contract's field check runs against every fixture: empty, malformed, bounded, and the detector's own. */
const wellFormedFindingsCheck: ConformanceCheck = {
  guarantee: "well-formed findings",
  async run({ detector, fixture }) {
    for (const finding of await detector.scan({ root: fixture.root })) assertWellFormedFinding(finding);
  },
};

/** Content that cannot be read as a declaration of any supported ecosystem. */
function malformedContents(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return '{"contract": [';
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "contract:\n  - [\n";
  if (lower.endsWith(".toml")) return '[contract\nvalue = "unterminated';
  if (
    lower.endsWith(".xml") ||
    lower.endsWith(".csproj") ||
    lower.endsWith(".fsproj") ||
    lower.endsWith(".vbproj") ||
    lower.endsWith(".props")
  ) {
    return "<Project><ItemGroup><Contract";
  }
  if (lower.endsWith(".tf") || lower.endsWith(".hcl")) return 'resource "contract" {';
  if (lower.endsWith(".lock") || lower.endsWith(".lockb")) return "\u0000\u0001 not a lockfile";
  if (lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz"))
    return "\u0000\u0001 not an archive";
  return "\u0000\u0001 not a declaration\n";
}

function expandWildcard(pattern: string): string {
  return pattern.replaceAll("*", "contract");
}

function declaredPaths(inputs: DetectorInputs): string[] {
  const paths = new Set<string>();
  for (const name of inputs.fileNames ?? []) paths.add(`nested/${expandWildcard(name)}`);
  for (const extension of inputs.extensions ?? []) paths.add(`nested/Contract${extension}`);
  for (const extension of inputs.sourceExtensions ?? []) paths.add(`src/contract${extension}`);
  for (const directory of inputs.directories ?? []) {
    paths.add(`${directory}/contract.yml`);
    paths.add(`${directory}/contract.json`);
  }
  return [...paths];
}

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-detector-contract-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

/** Unrelated files a detector must ignore, plus malformed content at every path it declares it may read. */
function malformedFixture(inputs: DetectorInputs): Record<string, string> {
  const files: Record<string, string> = {
    "README.md": "# Contract fixture\n",
    "notes.txt": "not a lifecycle declaration\n",
    "docs/guide.md": "This file is unrelated to any detector.\n",
  };
  for (const path of declaredPaths(inputs)) files[path] = malformedContents(path);
  return files;
}

/**
 * The same declared files at the edges of the limits conformance enforces: a path deeper than the directory
 * limit, a copy inside a vendored directory, and a file larger than the maximum finding source size.
 */
function limitsFixture(inputs: DetectorInputs): Record<string, string> {
  const declared = declaredPaths(inputs);
  const files: Record<string, string> = {};
  if (declared.length === 0) return files;

  const nested = declared[0]!;
  const baseName = nested.slice(nested.lastIndexOf("/") + 1);
  const deep = `${Array.from({ length: 40 }, () => "depth").join("/")}/${baseName}`;
  files[deep] = malformedContents(deep);
  files[`node_modules/contract/${baseName}`] = malformedContents(baseName);
  files[`vendor/contract/${baseName}`] = malformedContents(baseName);

  const oversized = nested;
  const padding = "x".repeat(1_000_001);
  files[oversized] = `${malformedContents(oversized)}\n${padding}`;
  return files;
}

function contractChecks(): readonly ConformanceCheck[] {
  return [determinismCheck, wellFormedFindingsCheck, evidenceCheck, locationsCheck, boundsCheck, declaredInputsCheck];
}

/**
 * A copy of the detector's own fixture repository, when it has one. Restoring the fixture names is what lets the
 * scan see `package.json` instead of `package.json.fixture` (decision 0027). A new detector gets this pass as soon
 * as it adds `tests/fixtures/<id>`, and the generated suite keeps working while that directory is still empty.
 */
async function fixtureRepository(detector: Detector): Promise<string | undefined> {
  const source = resolve("tests/fixtures", detector.id);
  if (!existsSync(source)) return undefined;

  const root = await mkdtemp(join(tmpdir(), `evergreen-detector-contract-${detector.id}-`));
  temporaryRoots.push(root);
  await cp(source, root, { recursive: true });
  await restoreFixtureNames(root);
  return root;
}

async function runContractFor(detector: Detector): Promise<void> {
  const inputs = detector.inputs ?? {};

  await runDetectorConformance({
    detector,
    fixtures: [{ name: "empty repository", root: await tree({}), expectedFindings: [] }],
    checks: [determinismCheck, zeroFindingsCheck, wellFormedFindingsCheck, boundsCheck, declaredInputsCheck],
  });

  await runDetectorConformance({
    detector,
    fixtures: [
      {
        name: "malformed declared inputs",
        root: await tree(malformedFixture(inputs)),
        expectedFindings: [],
      },
    ],
    checks: [malformedInputCheck, ...contractChecks()],
  });

  await runDetectorConformance({
    detector,
    fixtures: [{ name: "bounded tree", root: await tree(limitsFixture(inputs)), expectedFindings: [] }],
    checks: [malformedInputCheck, ...contractChecks()],
  });

  // The detector's own fixtures are the baseline for field, evidence, location, bound, and ordering checks.
  // Comparing against the first scan keeps the suite generic: it checks how the detector reports, not what.
  const repository = await fixtureRepository(detector);
  if (repository) {
    const findings = await detector.scan({ root: repository });
    await runDetectorConformance({
      detector,
      fixtures: [{ name: "detector fixtures", root: repository, expectedFindings: findings }],
      checks: contractChecks(),
    });
  }
}

for (const detector of builtInDetectors) {
  test(`${detector.id} satisfies the shared detector contract`, async () => {
    await runContractFor(detector);
  });
}

test("the shared suite covers every registered detector", () => {
  assert.ok(builtInDetectors.length > 20);
  assert.deepEqual(
    new Set(builtInDetectors.map((detector) => detector.id)).size,
    builtInDetectors.length,
    "detector ids must be unique",
  );
});

test("the fields guarantee rejects a finding with a missing required field", async () => {
  const root = await tree({ "fixture.txt": "fixture\n" });
  const brokenFinding: DetectorFinding = {
    id: "broken",
    ruleId: "broken",
    title: "",
    summary: "A finding without a title is not a contract-valid finding.",
    severity: "low",
    location: { path: "fixture.txt", line: 1 },
    sources: [{ title: "Official source", url: "https://example.com" }],
  };
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "broken-fields",
    async scan() {
      return [brokenFinding];
    },
  };

  await assert.rejects(
    runDetectorConformance({
      detector,
      fixtures: [{ name: "missing title", root, expectedFindings: [brokenFinding] }],
      checks: [wellFormedFindingsCheck],
    }),
    (error: unknown) => error instanceof ConformanceError && error.guarantee === "well-formed findings",
  );
});

// The suite reads `builtInDetectors`, so registering a detector in `src/detectors/index.ts` adds it here
// without touching this file. That is the contract: one suite, every detector.
