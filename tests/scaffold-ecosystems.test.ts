import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { scaffoldDetector } from "../tools/scaffold/index.js";
import { compile, removeAll, runTest, scaffoldCheckout } from "./scaffold-helpers.js";

const roots: string[] = [];

after(() => removeAll(roots));

const rule = (id: string, purl: string, vers: string, title: string) => ({
  id,
  ecosystem: id.split(".")[0],
  purl,
  vers,
  event: "end-of-life",
  title,
  summary: `${title}.`,
  severity: "high",
  replacement: "A supported release",
  deadline: "2026-01-01",
  sources: [{ title: "Support policy", url: "https://example.com/support-policy" }],
  provenance: { observedAt: "2026-10-16", reviewedAt: "2026-10-16", reviewer: "scaffold-test" },
});

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

/** The detector module both samples share: read the rules from the registry, parse the file, report matches. */
const detectorSource = (camel: string, id: string, file: string, ruleVersion: (value: string) => string) => `import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadDataFile } from "../data-source.js";
import { validateRegistryV2 } from "../registry.js";
import { defineDetector, DETECTOR_API_VERSION } from "../sdk.js";
import type { DetectorFinding } from "../sdk.js";
import { versContains } from "../vers.js";
import { parse${camel[0]!.toUpperCase()}${camel.slice(1)} } from "./${id}/parse.js";

export const ${camel}Detector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "${id}",
  async scan({ root }): Promise<DetectorFinding[]> {
    let contents: string;
    try {
      contents = await readFile(resolve(root, "${file}"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const registry = validateRegistryV2(await loadDataFile("registry/${id}.json"));
    const findings: DetectorFinding[] = [];
    for (const declaration of parse${camel[0]!.toUpperCase()}${camel.slice(1)}(contents)) {
      for (const rule of registry.rules) {
        if (!versContains(rule.vers, ${ruleVersion("declaration.value")})) continue;
        findings.push({
          id: \`\${rule.id}:${file}:\${declaration.line}\`,
          ruleId: rule.id,
          title: rule.title,
          summary: \`\${declaration.value}: \${rule.summary}\`,
          severity: rule.severity,
          location: { path: "${file}", line: declaration.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          sources: rule.sources,
        });
      }
    }
    return findings;
  },
});
`;

const testSource = (camel: string, id: string, positive: string, expected: string) => `import { resolve } from "node:path";
import { test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { ${camel}Detector } from "../src/detectors/${id}.js";

const fixtures = resolve("tests/fixtures/${id}");

test("${id} passes the full conformance suite", async () => {
  await runDetectorConformance({
    detector: ${camel}Detector,
    fixtures: [{ name: "${positive}", root: resolve(fixtures, "${positive}"), expectedFindings: ${expected} }],
    checks: [determinismCheck, evidenceCheck, locationsCheck, boundsCheck],
  });
  await runDetectorConformance({ detector: ${camel}Detector, fixtures: [{ name: "zero", root: resolve(fixtures, "zero"), expectedFindings: [] }], checks: [determinismCheck, zeroFindingsCheck] });
  await runDetectorConformance({ detector: ${camel}Detector, fixtures: [{ name: "malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }], checks: [malformedInputCheck] });
});
`;

const expectedFinding = (ruleId: string, title: string, value: string, file: string, line: number) =>
  `[{ id: "${ruleId}:${file}:${line}", ruleId: "${ruleId}", title: "${title}", summary: "${value}: ${title}.", severity: "high", location: { path: "${file}", line: ${line} }, replacement: "A supported release", sources: [{ title: "Support policy", url: "https://example.com/support-policy" }] }]`;

test("two different ecosystems, each filled in on top of a generated skeleton, compile together and pass full conformance", async () => {
  const checkout = await scaffoldCheckout(roots);
  const first = await scaffoldDetector("line-version", { root: checkout });
  const second = await scaffoldDetector("tag-list", { root: checkout, ecosystem: "tags" });
  assert.deepEqual([first.names.ecosystem, second.names.ecosystem], ["line-version", "tags"]);

  await write(checkout, {
    // Ecosystem 1: a one-line file holding a major version; versions below 5 are end of life.
    "src/detectors/line-version/parse.ts": `export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface LineVersionDeclaration {
  value: string;
  line: number;
}

export function parseLineVersion(contents: string): LineVersionDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const declarations: LineVersionDeclaration[] = [];
  for (const [index, line] of contents.split(/\\r?\\n/).entries()) {
    if (line.length > MAXIMUM_LINE_LENGTH) continue;
    if (/^\\d{1,6}$/.test(line.trim())) declarations.push({ value: line.trim(), line: index + 1 });
  }
  return declarations;
}
`,
    "src/detectors/line-version.ts": detectorSource("lineVersion", "line-version", ".line-version", (value) => `\`\${${value}}.0.0\``),
    "registry/line-version.json": JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "line-version", rules: [{ ...rule("line-version.release.below-5", "pkg:generic/line-version", "vers:semver/<5.0.0", "Release line is end of life"), ecosystem: "line-version" }] }, null, 2),
    "tests/fixtures/line-version/old/.line-version": "3\n",
    "tests/fixtures/line-version/zero/.line-version": "7\n",
    "tests/fixtures/line-version/malformed/.line-version": "three\n\u0000\u0001\n99999999999\n",
    "tests/line-version-detector.test.ts": testSource("lineVersion", "line-version", "old", expectedFinding("line-version.release.below-5", "Release line is end of life", "3", ".line-version", 1)),

    // Ecosystem 2: a list of `name@version` tags; any version of a legacy tag is deprecated.
    "src/detectors/tag-list/parse.ts": `export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface TagListDeclaration {
  value: string;
  line: number;
}

export function parseTagList(contents: string): TagListDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const declarations: TagListDeclaration[] = [];
  for (const [index, line] of contents.split(/\\r?\\n/).entries()) {
    if (line.length > MAXIMUM_LINE_LENGTH || line.trimStart().startsWith("#")) continue;
    if (/^legacy-tag@\\S+$/.test(line.trim())) declarations.push({ value: line.trim(), line: index + 1 });
  }
  return declarations;
}
`,
    "src/detectors/tag-list.ts": detectorSource("tagList", "tag-list", "tags.txt", () => '"1.0.0"'),
    "registry/tag-list.json": JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "tags", rules: [{ ...rule("tags.tag.legacy-tag.deprecated", "pkg:generic/legacy-tag", "vers:semver/*", "legacy-tag is deprecated"), ecosystem: "tags" }] }, null, 2),
    "tests/fixtures/tag-list/old/tags.txt": "# tags\nmodern-tag@2.0.0\nlegacy-tag@1.2.3\n",
    "tests/fixtures/tag-list/zero/tags.txt": "# legacy-tag@1.0.0 is only mentioned in a comment\nmodern-tag@2.0.0\n",
    "tests/fixtures/tag-list/malformed/tags.txt": "legacy-tag@\n@@@\n\u0000\n",
    "tests/tag-list-detector.test.ts": testSource("tagList", "tag-list", "old", expectedFinding("tags.tag.legacy-tag.deprecated", "legacy-tag is deprecated", "legacy-tag@1.2.3", "tags.txt", 3)),
  });

  const compiled = await compile(checkout);
  assert.equal(compiled.ok, true, compiled.output);

  for (const id of ["line-version", "tag-list"]) {
    const detector = await runTest(checkout, `dist/tests/${id}-detector.test.js`);
    assert.equal(detector.ok, true, `${id}: ${detector.output}`);
    assert.match(detector.output, new RegExp(`${id} passes the full conformance suite`));
    const parser = await runTest(checkout, `dist/tests/${id}-parse.test.js`);
    assert.equal(parser.ok, true, `${id} parser: ${parser.output}`);
  }
});
