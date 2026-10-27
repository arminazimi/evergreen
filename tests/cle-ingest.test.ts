import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";

import { CLE_FILE_NAME, cleDetector, ingestCle, parseCleDocument } from "../src/cle-ingest.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { CLE_SCHEMA } from "../src/export/cle.js";

const packagesRoot = resolve("tests/fixtures/cle-ingest/packages");
const temporaryRoots: string[] = [];
/** Fixed scan time for deterministic scheduled vs reached checks. */
const SCAN_AT = "2025-06-15T12:00:00.000Z";

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Copies committed package fixtures into a temporary `node_modules` tree (gitignores that path). */
async function installedFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cle-fixture-"));
  temporaryRoots.push(root);
  const modules = join(root, "node_modules");
  await mkdir(modules, { recursive: true });
  for (const name of ["legacy-widget", "current-widget"]) {
    await cp(join(packagesRoot, name), join(modules, name), { recursive: true });
  }
  return root;
}

async function packageWithCle(event: {
  type?: string;
  effective: string;
  version?: string;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cle-dated-"));
  temporaryRoots.push(root);
  const pkg = join(root, "node_modules", "dated-widget");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({
    name: "dated-widget",
    version: event.version ?? "1.0.0",
  }));
  await writeFile(join(pkg, CLE_FILE_NAME), JSON.stringify({
    $schema: CLE_SCHEMA,
    identifier: "pkg:npm/dated-widget",
    updatedAt: "2024-01-01T00:00:00Z",
    events: [{
      id: 1,
      type: event.type ?? "endOfLife",
      effective: event.effective,
      published: "2024-01-01T00:00:00Z",
      versions: [{ range: "vers:npm/*" }],
      description: "Dated CLE event for scheduled-vs-reached tests.",
    }],
  }));
  return root;
}

test("fixture package with CLE produces a finding with provenance", async () => {
  const root = await installedFixture();
  const findings = await ingestCle(root, { scannedAt: SCAN_AT });
  assert.equal(findings.length, 1);
  const finding = findings[0]!;
  assert.equal(finding.ruleId, "cle.endOfLife.npm-legacy-widget.2");
  assert.equal(finding.severity, "high");
  assert.equal(finding.deadline, "2024-01-01");
  assert.equal(finding.location.path, "node_modules/legacy-widget/cle.json");
  assert.equal(finding.location.line, 1);
  assert.match(finding.summary, /1\.x line is end of life/);
  assert.equal(finding.sources[0]!.title, "Maintainer CLE declaration");
  assert.equal(
    finding.sources[0]!.url,
    pathToFileURL(resolve(root, "node_modules/legacy-widget/cle.json")).href,
  );
  assert.equal(finding.sources[1]!.url, "https://example.com/legacy-widget/eol");
  assert.deepEqual(await ingestCle(root, { scannedAt: SCAN_AT }), findings);
});

test("CLE detector is registered and reports the fixture through a repository scan", async () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "cle"));
  assert.equal(cleDetector.id, "cle");
  assert.deepEqual(cleDetector.inputs?.fileNames, [CLE_FILE_NAME, "package.json"]);
  const root = await installedFixture();
  const result = await scanRepository(root, [cleDetector]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.detector, "cle");
  assert.equal(result.findings[0]!.ruleId, "cle.endOfLife.npm-legacy-widget.2");
  assert.equal(result.findings[0]!.severity, "high");
});

test("past, future, and exactly-equal effective dates follow decision 0010 severity", async () => {
  const past = await packageWithCle({ effective: "2024-01-01T00:00:00Z" });
  const [pastFinding] = await ingestCle(past, { scannedAt: SCAN_AT });
  assert.equal(pastFinding!.severity, "high");
  assert.equal(pastFinding!.deadline, "2024-01-01");
  assert.match(pastFinding!.summary, /Effective 2024-01-01/);
  assert.match(pastFinding!.title, /^End of life \(maintainer CLE\)$/);

  const future = await packageWithCle({ effective: "2026-01-01T00:00:00Z" });
  const [futureFinding] = await ingestCle(future, { scannedAt: SCAN_AT });
  assert.equal(futureFinding!.severity, "low");
  assert.equal(futureFinding!.deadline, "2026-01-01");
  assert.equal(futureFinding!.ruleId, pastFinding!.ruleId);
  assert.match(futureFinding!.summary, /Scheduled for 2026-01-01/);
  assert.match(futureFinding!.title, /scheduled/);
  // Finding identity (rule id + path) does not depend on the clock.
  assert.equal(futureFinding!.id, pastFinding!.id);

  const equal = await packageWithCle({ effective: SCAN_AT });
  const [equalFinding] = await ingestCle(equal, { scannedAt: SCAN_AT });
  assert.equal(equalFinding!.severity, "high");
  assert.equal(equalFinding!.deadline, "2025-06-15");
  assert.match(equalFinding!.summary, /Effective 2025-06-15/);
});

test("packages without cle.json produce no finding and no error", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cle-no-cle-"));
  temporaryRoots.push(root);
  const onlyManifest = join(root, "node_modules", "plain-pkg");
  await mkdir(onlyManifest, { recursive: true });
  await writeFile(join(onlyManifest, "package.json"), JSON.stringify({ name: "plain-pkg", version: "1.0.0" }));

  const invalidManifest = join(root, "node_modules", "broken-pkg");
  await mkdir(invalidManifest, { recursive: true });
  await writeFile(join(invalidManifest, "package.json"), "{ not json");

  assert.deepEqual(await ingestCle(root, { scannedAt: SCAN_AT }), []);
  assert.deepEqual(await cleDetector.scan({ root, scannedAt: SCAN_AT }), []);
});

test("mismatched identifier, unsupported schema, and non-matching versions produce no finding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-cle-ingest-"));
  temporaryRoots.push(directory);
  const pkg = join(directory, "node_modules", "other");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "other", version: "1.0.0" }));
  await writeFile(join(pkg, CLE_FILE_NAME), JSON.stringify({
    $schema: CLE_SCHEMA,
    identifier: "pkg:npm/not-other",
    updatedAt: "2024-01-01T00:00:00Z",
    events: [{
      id: 1, type: "endOfLife", effective: "2024-01-01T00:00:00Z", published: "2024-01-01T00:00:00Z",
      versions: [{ range: "vers:npm/*" }],
    }],
  }));
  assert.deepEqual(await ingestCle(directory, { scannedAt: SCAN_AT }), []);

  await writeFile(join(pkg, CLE_FILE_NAME), JSON.stringify({
    $schema: "https://example.com/not-cle.json",
    identifier: "pkg:npm/other",
    updatedAt: "2024-01-01T00:00:00Z",
    events: [],
  }));
  assert.deepEqual(await ingestCle(directory, { scannedAt: SCAN_AT }), []);
  assert.equal(parseCleDocument(JSON.parse(await readFile(join(pkg, CLE_FILE_NAME), "utf8"))), undefined);
});

test("parseCleDocument accepts valid CLE and rejects incomplete documents", () => {
  const valid = {
    $schema: CLE_SCHEMA,
    identifier: "pkg:npm/example",
    updatedAt: "2024-01-01T00:00:00Z",
    events: [{
      id: 1, type: "endOfSupport", effective: "2024-01-01T00:00:00Z", published: "2024-01-01T00:00:00Z",
      versions: [{ range: "vers:npm/<2" }],
    }],
  };
  assert.deepEqual(parseCleDocument(valid)?.identifier, "pkg:npm/example");
  assert.equal(parseCleDocument(null), undefined);
  assert.equal(parseCleDocument({ ...valid, events: "nope" }), undefined);
  assert.equal(parseCleDocument({ ...valid, identifier: "" }), undefined);
});
