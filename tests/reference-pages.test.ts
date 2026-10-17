import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { parse } from "yaml";

import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import { buildFiles, drift, loadRegistries, renderRulePage, ruleUrl, write } from "../tools/build-reference-pages.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const rule = (overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule => ({
  id: "demo.thing.eol-1",
  ecosystem: "demo",
  purl: "pkg:generic/demo",
  vers: "vers:semver/<2.0.0",
  event: "end-of-life",
  title: "Demo 1 is end of life",
  summary: "The vendor lists Demo 1 as end of life.",
  severity: "high",
  replacement: "Demo 2 | or later",
  deadline: "2026-01-31",
  sources: [{ title: "Demo lifecycle", url: "https://example.com/demo" }],
  provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "someone" },
  ...overrides,
});

const registry = (rules: RegistryV2Rule[], maxReviewAgeDays?: number): RegistryV2 => ({
  schemaVersion: "evergreen.registry.v2",
  ecosystem: "demo",
  ...(maxReviewAgeDays ? { freshness: { maxReviewAgeDays } } : {}),
  rules,
});

function structuredData(page: string): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(page);
  assert.ok(match, "the page has no JSON-LD block");
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

test("every bundled rule has a page, and the committed pages match the registry", async () => {
  const registries = await loadRegistries();
  const total = registries.reduce((sum, item) => sum + item.rules.length, 0);
  assert.ok(total >= 100);
  const files = buildFiles(registries);
  assert.equal(files.filter((file) => file.path.startsWith("docs/rules/") && !file.path.endsWith("index.md")).length, total);
  assert.deepEqual(await drift(files), []);
});

test("a page states status, versions, dates, sources, freshness, migration, and detectors", () => {
  const page = renderRulePage(
    rule({
      migration: {
        constraints: ["Keep behavior."],
        steps: [{ id: "change", title: "Change it", instructions: "Do the change.", targets: "declaration" }],
        verification: [{ command: "make test", purpose: "Run the tests." }],
      },
    }),
    180,
  );
  assert.match(page, /^---\ntitle: "Demo 1 is end of life"\n/);
  assert.match(page, /\| Status \| End of life \|/);
  assert.match(page, /\| Affected versions \| `vers:semver\/<2\.0\.0` \|/);
  assert.match(page, /\| Date from the source \| 2026-01-31 \|/);
  assert.match(page, /\| Replacement \| Demo 2 \\\| or later \|/);
  assert.match(page, /\| Review due \| 2027-03-31 \(180 days after the last review\) \|/);
  assert.match(page, /- \[Demo lifecycle\]\(https:\/\/example\.com\/demo\)/);
  assert.match(page, /1\. \*\*Change it\.\*\* Do the change\./);
  assert.match(page, /- `make test`: Run the tests\./);
  assert.match(page, /No built-in detector reads `demo` declarations yet/);
});

test("a range with a pipe does not break the table", () => {
  const page = renderRulePage(rule({ vers: "vers:semver/>=1.0.0|<2.0.0" }), 365);
  assert.match(page, /\| Affected versions \| `vers:semver\/>=1\.0\.0\\\|<2\.0\.0` \|/);
});

test("a rule with no day or migration says so instead of inventing one", () => {
  const { deadline: _deadline, replacement: _replacement, ...bare } = rule();
  const page = renderRulePage(bare, 365);
  assert.match(page, /\| Date from the source \| The source gives no day \|/);
  assert.doesNotMatch(page, /## Migration/);
  assert.doesNotMatch(page, /\| Replacement \|/);
});

test("bundled detectors are linked to their pages", async () => {
  const registries = await loadRegistries();
  const java = registries.find((item) => item.ecosystem === "java")!;
  assert.match(renderRulePage(java.rules[0]!, 180), /\[`java`\]\(\.\.\/detectors\/java\.md\)/);
  const npm = registries.find((item) => item.ecosystem === "npm")!;
  assert.match(renderRulePage(npm.rules[0]!, 365), /The `npm` detector\./);
});

test("a long summary is cut at a sentence for the description", () => {
  const long = `${"First sentence that is fairly long and descriptive. ".repeat(2)}${"More words follow here. ".repeat(20)}`;
  const description = /^description: (.*)$/m.exec(renderRulePage(rule({ summary: long }), 365))![1]!;
  const text = JSON.parse(description) as string;
  assert.ok(text.length <= 200);
  assert.ok(text.endsWith("."));
});

test("drift names a changed page, a missing page, and a stale page", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-reference-"));
  temporaryRoots.push(root);
    const files = buildFiles([registry([rule(), rule({ id: "demo.other.eol-2", title: "Demo 2 is end of life" })])]);
  await write(files, root);
  assert.deepEqual(await drift(files, root), []);

  await writeFile(join(root, "docs/rules/demo.thing.eol-1.md"), "edited\n");
  const fewer = buildFiles([registry([rule()])]);
  assert.deepEqual(await drift(fewer, root), ["differs: docs/rules/demo.thing.eol-1.md", "differs: docs/rules/index.md", "stale: docs/rules/demo.other.eol-2.md"]);

  await write(fewer, root);
  assert.deepEqual(await drift(fewer, root), []);
  assert.deepEqual(await drift(buildFiles([registry([rule(), rule({ id: "demo.new.eol-3" })])]), root), [
    "differs: docs/rules/index.md",
    "missing: docs/rules/demo.new.eol-3.md",
  ]);
});

test("a rule id in two registries is an error", () => {
  assert.throws(() => buildFiles([registry([rule()]), { ...registry([rule()]), ecosystem: "other" }]), /more than one registry/);
});

test("only v2 rule registries are read from the registry directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-registries-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "demo.json"), JSON.stringify(registry([rule()])));
  await writeFile(join(root, "sources.lock.json"), JSON.stringify({ schemaVersion: "evergreen.source-lock.v1", sources: {} }));
  await writeFile(join(root, "shas.json"), JSON.stringify({ schemaVersion: "other", entries: [] }));
  assert.deepEqual((await loadRegistries(root)).map((item) => item.ecosystem), ["demo"]);
  assert.ok((await readFile(join(root, "demo.json"), "utf8")).length > 0);
});

test("each page carries valid structured data that agrees with the page", async () => {
  for (const item of await loadRegistries()) {
    for (const entry of item.rules) {
      const page = renderRulePage(entry, 365);
      const data = structuredData(page);
      assert.equal(data["@context"], "https://schema.org");
      assert.equal(data["@type"], "TechArticle");
      assert.equal(data.url, ruleUrl(entry.id));
      assert.equal(data["@id"], data.url);
      assert.equal(data.headline, entry.title);
      assert.equal(data.dateModified, entry.provenance.reviewedAt);
      assert.deepEqual((data.citation as Array<{ url: string }>).map((citation) => citation.url), entry.sources.map((source) => source.url));
      assert.equal((data.about as { identifier: string }).identifier, entry.purl);
      assert.equal(typeof data.description, "string");
      assert.ok((data.description as string).length <= 201);
      assert.match(data.isBasedOn as string, new RegExp(`/registry/${entry.ecosystem}\\.json$`));
      assert.equal((data.publisher as { url: string }).url, "https://arminazimi.github.io/evergreen");
    }
  }
});

test("data can never close the structured-data element", () => {
  const page = renderRulePage(rule({ summary: "Bad </script><script>alert(1)</script> text", title: "A </script> title" }), 365);
  const block = page.slice(page.indexOf('<script type="application/ld+json">'));
  // Only the closing tag the generator writes: no `</` appears inside the JSON.
  assert.equal(block.indexOf("</"), block.lastIndexOf("</script>"));
  assert.equal(structuredData(page).headline, "A </script> title");
  assert.equal(structuredData(page).description, "Bad </script><script>alert(1)</script> text");
});

test("the page says where the machine-readable data lives and that no CLE export exists yet", () => {
  const page = renderRulePage(rule(), 365);
  assert.match(page, /registry\/demo\.json/);
  assert.match(page, /A CLE \(ECMA-428\) export is not published yet\./);
});

const run = promisify(execFile);
const generator = resolve("dist/tools/build-reference-pages.js");

async function checkIn(directory: string): Promise<{ code: number; stderr: string }> {
  try {
    await run(process.execPath, [generator, "--check"], { cwd: directory });
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { code: number; stderr: string };
    return { code: failure.code, stderr: failure.stderr };
  }
}

test("--check passes on fresh pages and fails, naming the page, when one drifts", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-reference-cli-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "registry"), { recursive: true });
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule()])));
  await write(buildFiles([registry([rule()])]), root);
  assert.deepEqual(await checkIn(root), { code: 0, stderr: "" });

  // The registry changes, but the pages are not regenerated.
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule({ summary: "A different claim." })])));
  const drifted = await checkIn(root);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stderr, /differs: docs\/rules\/demo\.thing\.eol-1\.md/);
  assert.match(drifted.stderr, /npm run build:reference/);

  // A rule is removed: its page is stale.
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([])));
  assert.match((await checkIn(root)).stderr, /stale: docs\/rules\/demo\.thing\.eol-1\.md/);
});

test("CI runs the drift check", async () => {
  const workflow = parse(await readFile(".github/workflows/ci.yml", "utf8")) as {
    jobs: { check: { steps: Array<{ name?: string; run?: string; if?: string }> } };
  };
  const step = workflow.jobs.check.steps.find((item) => item.run === "node dist/tools/build-reference-pages.js --check");
  assert.ok(step, "ci.yml has no reference-page drift step");
  assert.match(step.if ?? "", /runner\.os == 'Linux'/);
});
