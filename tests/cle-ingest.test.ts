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

test("fixture package with CLE produces a finding with provenance", async () => {
  const root = await installedFixture();
  const findings = await ingestCle(root);
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
  assert.deepEqual(await ingestCle(root), findings);
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
  assert.deepEqual(await ingestCle(directory), []);

  await writeFile(join(pkg, CLE_FILE_NAME), JSON.stringify({
    $schema: "https://example.com/not-cle.json",
    identifier: "pkg:npm/other",
    updatedAt: "2024-01-01T00:00:00Z",
    events: [],
  }));
  assert.deepEqual(await ingestCle(directory), []);
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
