import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import type { CapabilityManifest } from "../src/capabilities.js";
import {
  COMPATIBILITY_PATH,
  END_MARKER,
  START_MARKER,
  buildDocument,
  loadDescriptions,
  renderCoverageTable,
  replaceCoverageTable,
  validateDescriptions,
} from "../tools/coverage-matrix.js";
import type { CoverageDescriptions } from "../tools/coverage-matrix.js";

const ROW_NAMES = [
  "CI runner images",
  "Container base images",
  ".NET",
  "Go",
  "Java and Kotlin (JVM)",
  "Kubernetes APIs",
  "GitHub Actions",
  "Node.js and npm",
  "PHP",
  "Python",
  "Ruby",
  "Rust",
  "Swift",
  "Android",
  "Other language and platform ecosystems",
];

test("the committed coverage matrix matches the manifest and descriptions", async () => {
  const document = await readFile(resolve(COMPATIBILITY_PATH), "utf8");
  assert.equal(document, await buildDocument());
});

test("every manifest ecosystem has exactly one coverage description", async () => {
  const manifest = getCapabilityManifest();
  const descriptions = await loadDescriptions();
  validateDescriptions(manifest, descriptions);
  const described = descriptions.rows.flatMap((row) => row.ecosystems);
  assert.deepEqual([...described].sort(), manifest.ecosystems.map((ecosystem) => ecosystem.id).sort());
});

test("a missing, orphaned, duplicate, or ecosystem-less description is an error", async () => {
  const manifest = getCapabilityManifest();
  const descriptions = await loadDescriptions();

  const missing = { ...descriptions, rows: descriptions.rows.filter((row) => !row.ecosystems.includes("rust")) };
  assert.throws(() => validateDescriptions(manifest, missing), /Ecosystem "rust" has no coverage description/);

  const orphaned = { ...descriptions, rows: [...descriptions.rows, { ecosystems: ["cobol"], name: "COBOL", coverage: "COBOL." }] };
  assert.throws(() => validateDescriptions(manifest, orphaned), /names "cobol", which is not in the capability manifest/);

  const duplicate = { ...descriptions, rows: [...descriptions.rows, { ecosystems: ["rust"], name: "Rust again", coverage: "Rust." }] };
  assert.throws(() => validateDescriptions(manifest, duplicate), /Ecosystem "rust" has more than one coverage description/);

  const ecosystemless = { ...descriptions, rows: [...descriptions.rows, { ecosystems: [], name: "Nothing", coverage: "Nothing." }] };
  assert.throws(() => validateDescriptions(manifest, ecosystemless), /Coverage row "Nothing" names no ecosystem/);
});

test("the table keeps the documented rows, order, one Node.js and npm row, and the unsupported row", async () => {
  const table = renderCoverageTable(getCapabilityManifest(), await loadDescriptions());
  let previous = -1;
  for (const name of ROW_NAMES) {
    const index = table.indexOf(`| ${name} |`);
    assert.ok(index > previous, `${name} is missing or out of order`);
    previous = index;
  }
  assert.equal(table.match(/\| Node\.js and npm \|/g)?.length, 1);
  assert.match(table, /\| Other language and platform ecosystems \| Unsupported \| Report the limitation; do not infer lifecycle status without a detector\. \|/);
});

test("status words are derived from maturity", () => {
  const manifest = getCapabilityManifest();
  const synthetic: CapabilityManifest = {
    ...manifest,
    ecosystems: [
      { id: "alpha", status: "supported", maturity: "beta", detectorIds: ["alpha"] },
      { id: "gamma", status: "supported", maturity: "stable", detectorIds: ["gamma"] },
    ],
  };
  const descriptions: CoverageDescriptions = {
    schemaVersion: "evergreen.coverage-descriptions.v1",
    rows: [
      { ecosystems: ["alpha"], name: "Alpha", coverage: "Alpha coverage." },
      { ecosystems: ["gamma"], name: "Gamma", coverage: "Gamma coverage." },
    ],
    unsupported: { name: "Other", coverage: "Other coverage." },
  };
  const table = renderCoverageTable(synthetic, descriptions);
  assert.match(table, /\| Alpha \| Beta \| Alpha coverage\. \|/);
  assert.match(table, /\| Gamma \| Supported \| Gamma coverage\. \|/);
  assert.match(table, /\| Other \| Unsupported \| Other coverage\. \|/);
});

test("a row may only combine ecosystems served by the same detectors", () => {
  const manifest = getCapabilityManifest();
  const synthetic: CapabilityManifest = {
    ...manifest,
    ecosystems: [
      { id: "one", status: "supported", maturity: "stable", detectorIds: ["one"] },
      { id: "two", status: "supported", maturity: "stable", detectorIds: ["two"] },
    ],
  };
  const descriptions: CoverageDescriptions = {
    schemaVersion: "evergreen.coverage-descriptions.v1",
    rows: [{ ecosystems: ["one", "two"], name: "Both", coverage: "Both coverage." }],
    unsupported: { name: "Other", coverage: "Other coverage." },
  };
  assert.throws(() => validateDescriptions(synthetic, descriptions), /groups ecosystems served by different detectors/);
});

test("a row served by several ecosystems takes the lowest maturity", () => {
  const manifest = getCapabilityManifest();
  const synthetic: CapabilityManifest = {
    ...manifest,
    ecosystems: [
      { id: "stable-one", status: "supported", maturity: "stable", detectorIds: ["shared"] },
      { id: "experimental-one", status: "experimental", maturity: "experimental", detectorIds: ["shared"] },
    ],
  };
  const descriptions: CoverageDescriptions = {
    schemaVersion: "evergreen.coverage-descriptions.v1",
    rows: [{ ecosystems: ["stable-one", "experimental-one"], name: "Shared", coverage: "Shared coverage." }],
    unsupported: { name: "Other", coverage: "Other coverage." },
  };
  assert.match(renderCoverageTable(synthetic, descriptions), /\| Shared \| Experimental \| Shared coverage\. \|/);
});

test("only the bytes between the markers are replaced", () => {
  const document = `before\n${START_MARKER}\nold\n${END_MARKER}\nafter\n`;
  assert.equal(
    replaceCoverageTable(document, "new\ntable"),
    `before\n${START_MARKER}\nnew\ntable\n${END_MARKER}\nafter\n`,
  );
  assert.throws(() => replaceCoverageTable("no markers", "table"), /must contain/);
});
