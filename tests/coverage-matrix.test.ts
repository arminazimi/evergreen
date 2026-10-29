import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import type { CapabilityManifest } from "../src/capabilities.js";
import type { LifecycleEvent, RegistryV2Rule } from "../src/registry.js";
import {
  COMPATIBILITY_PATH,
  END_MARKER,
  START_MARKER,
  STATE_OF_EOL_END_MARKER,
  STATE_OF_EOL_PATH,
  STATE_OF_EOL_START_MARKER,
  VALIDATION_PATH,
  aggregateStateOfEol,
  buildDocument,
  buildStateOfEolDocument,
  buildValidationDocument,
  loadDescriptions,
  productNameFromPurl,
  renderAccuracyTable,
  renderCoverageTable,
  renderStateOfEolSection,
  replaceAccuracyTable,
  replaceCoverageTable,
  replaceStateOfEolSection,
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
  "C and C++",
  "Dart and Flutter",
  "Deno and Bun",
  "Database runtimes",
  "Elixir and Mix",
  "Scala and sbt",
  "Shell and PowerShell",
  "Terraform",
  "Serverless runtimes",
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

test("the committed accuracy tables match the last recorded full corpus run", async () => {
  const document = await readFile(resolve(VALIDATION_PATH), "utf8");
  assert.equal(document, await buildValidationDocument());
});

test("accuracy rows compute precision and recall from counts and show dashes for unscored detectors", () => {
  const thresholds = {
    schemaVersion: "evergreen.corpus-thresholds.v1",
    detectors: {
      alpha: { level: "stable", stable: true, minPrecision: 0.95 },
      beta: { level: "experimental", stable: false, minPrecision: 0 },
      gamma: { level: "beta", stable: true, minPrecision: 0.95 },
    },
    lastFullRun: {
      date: "2026-10-21",
      commit: "abc1234",
      repositories: 10,
      findings: 9,
      precision: 0.9,
      recall: 0.9,
      perDetector: {
        alpha: { truePositives: 9, falsePositives: 1, falseNegatives: 3 },
        beta: { truePositives: 0, falsePositives: 0, falseNegatives: 0 },
      },
    },
  } as const;
  const table = renderAccuracyTable(thresholds as never);
  assert.match(table, /\| alpha \| Supported \| 9 \| 1 \| 3 \| 0\.900 \| 0\.750 \|/);
  assert.match(table, /\| beta \| Experimental \| 0 \| 0 \| 0 \| n\/a \| n\/a \|/);
  assert.match(table, /\| gamma \| Beta \| — \| — \| — \| — \| — \|/);
  assert.throws(() => renderAccuracyTable({ ...thresholds, lastFullRun: undefined } as never), /no lastFullRun/);
  assert.throws(() => replaceAccuracyTable("no markers", table), /accuracy-tables:start/);
});

test("the committed State of EOL page matches the corpus and last full run", async () => {
  const document = await readFile(resolve(STATE_OF_EOL_PATH), "utf8");
  assert.equal(document, await buildStateOfEolDocument());
});

test("product names come from the Package URL namespace and name", () => {
  assert.equal(productNameFromPurl("pkg:generic/nodejs"), "nodejs");
  assert.equal(productNameFromPurl("pkg:github/actions/checkout"), "actions/checkout");
});

function rule(partial: {
  id: string;
  purl: string;
  title: string;
  event?: LifecycleEvent;
}): RegistryV2Rule {
  return {
    id: partial.id,
    ecosystem: "test",
    purl: partial.purl,
    vers: "vers:generic/*",
    event: partial.event ?? "end-of-life",
    title: partial.title,
    summary: partial.title,
    severity: "high",
    sources: [{ title: "source", url: "https://example.com" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-01", reviewer: "test" },
  };
}

test("State of EOL aggregates findings by product and release line", () => {
  const rules = new Map<string, RegistryV2Rule>([
    ["nodejs.runtime.eol-18", rule({ id: "nodejs.runtime.eol-18", purl: "pkg:generic/nodejs", title: "Node.js 18 is end-of-life" })],
    ["nodejs.runtime.eol-20", rule({ id: "nodejs.runtime.eol-20", purl: "pkg:generic/nodejs", title: "Node.js 20 is end-of-life" })],
    [
      "actions.checkout.v2",
      rule({
        id: "actions.checkout.v2",
        purl: "pkg:github/actions/checkout",
        title: "actions/checkout@v2 is deprecated",
        event: "deprecated",
      }),
    ],
  ]);
  const summary = aggregateStateOfEol(
    {
      repositories: [
        {
          repository: "one/repo",
          expected: [{ ruleId: "nodejs.runtime.eol-18" }, { ruleId: "actions.checkout.v2" }],
        },
        {
          repository: "two/repo",
          expected: [{ ruleId: "nodejs.runtime.eol-18" }, { ruleId: "nodejs.runtime.eol-20" }],
        },
        { repository: "three/repo", expected: [] },
      ],
    },
    rules,
  );
  assert.deepEqual(summary, {
    repositories: 3,
    findings: 4,
    products: 2,
    lines: 3,
    byProduct: [
      { product: "nodejs", purl: "pkg:generic/nodejs", findings: 3, lines: 2, repositories: 2 },
      { product: "actions/checkout", purl: "pkg:github/actions/checkout", findings: 1, lines: 1, repositories: 1 },
    ],
    byLine: [
      {
        product: "nodejs",
        purl: "pkg:generic/nodejs",
        ruleId: "nodejs.runtime.eol-18",
        title: "Node.js 18 is end-of-life",
        event: "end-of-life",
        findings: 2,
        repositories: 2,
      },
      {
        product: "actions/checkout",
        purl: "pkg:github/actions/checkout",
        ruleId: "actions.checkout.v2",
        title: "actions/checkout@v2 is deprecated",
        event: "deprecated",
        findings: 1,
        repositories: 1,
      },
      {
        product: "nodejs",
        purl: "pkg:generic/nodejs",
        ruleId: "nodejs.runtime.eol-20",
        title: "Node.js 20 is end-of-life",
        event: "end-of-life",
        findings: 1,
        repositories: 1,
      },
    ],
  });
  assert.throws(
    () => aggregateStateOfEol({ repositories: [{ repository: "x/y", expected: [{ ruleId: "missing" }] }] }, rules),
    /unknown rule "missing"/,
  );
});

test("State of EOL section cites the method, corpus revision, and both aggregate tables", () => {
  const summary = aggregateStateOfEol(
    {
      repositories: [
        { repository: "one/repo", expected: [{ ruleId: "nodejs.runtime.eol-18" }] },
      ],
    },
    new Map([
      [
        "nodejs.runtime.eol-18",
        rule({ id: "nodejs.runtime.eol-18", purl: "pkg:generic/nodejs", title: "Node.js 18 is end-of-life" }),
      ],
    ]),
  );
  const section = renderStateOfEolSection(summary, {
    date: "2026-10-24",
    commit: "c7b4e14",
    repositories: 456,
    findings: 2201,
    precision: 1,
    recall: 1,
    perDetector: {},
  });
  assert.match(section, /commit `c7b4e14` on 2026-10-24/);
  assert.match(section, /\[Validation\]\(VALIDATION\.md\)/);
  assert.match(section, /\| Products with findings \| 1 \|/);
  assert.match(section, /### By product/);
  assert.match(section, /\| nodejs \| 1 \| 1 \| 1 \|/);
  assert.match(section, /### By product and release line/);
  assert.match(section, /\| nodejs \| Node\.js 18 is end-of-life \| \[`nodejs\.runtime\.eol-18`\]\(rules\/nodejs\.runtime\.eol-18\.html\) \| end-of-life \| 1 \| 1 \|/);
  assert.throws(() => replaceStateOfEolSection("no markers", section), /state-of-eol:start/);
  assert.equal(
    replaceStateOfEolSection(`before\n${STATE_OF_EOL_START_MARKER}\nold\n${STATE_OF_EOL_END_MARKER}\nafter\n`, "new"),
    `before\n${STATE_OF_EOL_START_MARKER}\nnew\n${STATE_OF_EOL_END_MARKER}\nafter\n`,
  );
});
