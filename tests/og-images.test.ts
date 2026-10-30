import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { RegistryV2Rule } from "../src/registry.js";
import {
  BRAND_TEMPLATE,
  DEFAULT_OG_ID,
  OG_DIRECTORY,
  buildOgFiles,
  drift,
  renderDefaultOgImage,
  renderRuleOgImage,
  wrapText,
  write,
} from "../tools/build-og-images.js";
import { DEFAULT_OG_IMAGE_PATH, loadRegistries, ruleOgImagePath } from "../tools/build-reference-pages.js";

const rule = (overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule => ({
  id: "demo.thing.eol-1",
  title: "Demo 1 is end of life",
  summary: "Demo summary.",
  event: "end-of-life",
  severity: "high",
  ecosystem: "demo",
  purl: "pkg:generic/demo",
  vers: "vers:semver/<2.0.0",
  deadline: "2026-01-31",
  replacement: "Demo 2",
  sources: [{ title: "Demo lifecycle", url: "https://example.com/demo" }],
  provenance: { observedAt: "2026-01-01", reviewedAt: "2026-01-01", reviewer: "tester" },
  ...overrides,
});

test("the default OG image follows the brand social-preview template", async () => {
  const template = await readFile(BRAND_TEMPLATE, "utf8");
  const image = renderDefaultOgImage();
  assert.match(image, /width="1280"/);
  assert.match(image, /height="640"/);
  assert.match(image, /#0C1110/);
  assert.match(image, /EVERGREEN/);
  assert.match(image, /Know what breaks next\./);
  assert.match(image, /npx evergreen-deprecation scan \./);
  assert.equal([...image.matchAll(/https?:\/\//g)].length, 1); // xmlns only
  assert.ok(template.includes("social-preview") || template.includes("EVERGREEN"));
});

test("a rule OG image names status, title, ecosystem, and deadline", () => {
  const image = renderRuleOgImage(rule());
  assert.match(image, /End of life/);
  assert.match(image, /Demo 1 is end of life/);
  assert.match(image, /demo · 2026-01-31/);
  assert.match(image, /evergreen/);
  assert.equal([...image.matchAll(/https?:\/\//g)].length, 1); // xmlns only
  assert.equal(image.includes("<script"), false);
});

test("OG markup escapes title characters that would break SVG", () => {
  const image = renderRuleOgImage(rule({ title: `A <b> & "quoted" title` }));
  assert.match(image, /A &lt;b&gt; &amp; &quot;quoted&quot; title/);
  assert.doesNotMatch(image, /<b>/);
});

test("long titles wrap and truncate without overflowing the card", () => {
  const lines = wrapText("alpha beta gamma delta epsilon zeta eta theta iota kappa", 120, 36, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1]!.endsWith("…") || lines.join(" ").length < 80);
  const image = renderRuleOgImage(
    rule({
      title: "The very long Google Play Billing Library version five is past its deprecation deadline for everyone",
    }),
  );
  assert.equal([...image.matchAll(/<text x="552" y="\d+" fill="#F3F6F4" font-size="36"/g)].length <= 3, true);
});

test("buildOgFiles emits a default image and one image per rule", async () => {
  const registries = await loadRegistries();
  const rules = registries.flatMap((item) => item.rules);
  const files = buildOgFiles(rules);
  assert.ok(files.some((file) => file.path === `${OG_DIRECTORY}/${DEFAULT_OG_ID}.svg`));
  assert.equal(files.length, rules.length + 1);
  assert.equal(new Set(files.map((file) => file.path)).size, files.length);
  for (const entry of rules.slice(0, 5)) {
    assert.ok(files.some((file) => file.path === `${OG_DIRECTORY}/${entry.id}.svg`));
    assert.equal(ruleOgImagePath(entry.id), `/assets/og/${entry.id}.svg`);
  }
  assert.equal(DEFAULT_OG_IMAGE_PATH, "/assets/og/default.svg");
});

test("write and drift round-trip, and stale files are reported", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-og-"));
  try {
    const files = buildOgFiles([rule()]);
    await write(files, root);
    assert.deepEqual(await drift(files, root), []);
    await writeFile(resolve(root, OG_DIRECTORY, "stale.svg"), "<svg/>\n");
    assert.deepEqual(await drift(files, root), [`stale: ${OG_DIRECTORY}/stale.svg`]);
    await write(files, root);
    assert.deepEqual(await drift(files, root), []);
    await mkdir(resolve(root, OG_DIRECTORY), { recursive: true });
    await writeFile(resolve(root, files[0]!.path), "changed\n");
    assert.ok((await drift(files, root)).some((problem) => problem.startsWith("differs:")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a colliding default rule id is rejected", () => {
  assert.throws(() => buildOgFiles([rule({ id: DEFAULT_OG_ID })]), /collides with the default OG image/);
});
