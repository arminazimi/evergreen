import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { buildLlmsFull, indexedPages, renderLlmsFull, SITE, stripFrontMatter, stripLiquidRaw } from "../tools/build-llms-full.js";

const execute = promisify(execFile);
const read = (path: string) => readFile(resolve(path), "utf8");
const index = await read("docs/llms.txt");

test("llms.txt follows the llms.txt format: a title, a summary, and sections of described links", () => {
  const lines = index.split("\n");
  assert.equal(lines[0], "# Evergreen");
  assert.match(lines[2]!, /^> .{80,}/, "a one-paragraph summary as a block quote");
  assert.ok(index.endsWith("\n") && !index.includes("\r"));
  const sections = lines.filter((line) => line.startsWith("## "));
  assert.deepEqual(sections, ["## Use Evergreen", "## Evidence, data, and trust", "## Extend Evergreen", "## Optional"]);
  const items = lines.filter((line) => line.startsWith("- "));
  assert.ok(items.length >= 12);
  for (const item of items) assert.match(item, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\): .{10,}\.$/, item);
  assert.equal(sections.at(-1), "## Optional", "optional pages come last so a short context can drop them");
});

test("every page it links exists, is named once, and is a page of this site", async () => {
  const pages = indexedPages(index);
  assert.ok(pages.length >= 12);
  assert.equal(new Set(pages.map((page) => page.file)).size, pages.length, "no page is listed twice");
  for (const page of pages) {
    assert.ok(page.url.startsWith(SITE) && page.url.endsWith(".html"), page.url);
    await access(resolve("docs", page.file));
  }
  assert.ok(index.includes(`${SITE}llms-full.txt`), "the index points at the full file");
});

test("llms-full.txt is up to date with the pages (CI fails on drift)", async () => {
  assert.equal(await read("docs/llms-full.txt"), await renderLlmsFull(), "run: npm run build:llms");
  await execute(process.execPath, [resolve("dist/tools/build-llms-full.js"), "--check"]);
});

test("the full file has every linked page, in order, without Jekyll front matter", async () => {
  const full = await read("docs/llms-full.txt");
  assert.match(full, /^# Evergreen: full documentation\n\n> /);
  const sources = [...full.matchAll(/^Source: (\S+)$/gm)].map((match) => match[1]);
  assert.deepEqual(sources, indexedPages(index).map((page) => page.url));
  assert.doesNotMatch(full, /^title: /m);
  assert.doesNotMatch(full, /\r/);
  assert.ok(full.endsWith("\n") && !full.endsWith("\n\n"));
  for (const page of indexedPages(index)) {
    const heading = stripLiquidRaw(stripFrontMatter(await read(`docs/${page.file}`))).trim().split("\n")[0]!;
    assert.ok(full.includes(`\n${heading}\n`), `${page.file}'s first line is in the full file`);
  }
  assert.ok(full.length > 50_000);
});

test("front matter is removed and everything else is kept", () => {
  assert.equal(stripFrontMatter("---\ntitle: X\n---\n\n# Page\n\ntext\n"), "# Page\n\ntext\n");
  assert.equal(stripFrontMatter("# No front matter\n"), "# No front matter\n");
  assert.equal(stripFrontMatter("text with --- inside\n---\nnot front matter\n"), "text with --- inside\n---\nnot front matter\n");
});

test("a link to a missing page stops the build with a clear message, and a changed page makes the check fail", async () => {
  assert.throws(() => buildLlmsFull("- [Gone](https://arminazimi.github.io/evergreen/GONE.html): x.\n", new Map()), /docs\/GONE\.md does not exist/);

  const root = await mkdtemp(join(tmpdir(), "evergreen-llms-"));
  try {
    await cp(resolve("docs"), join(root, "docs"), { recursive: true });
    const before = await renderLlmsFull(root);
    assert.equal(before, await read("docs/llms-full.txt"));
    await writeFile(join(root, "docs", "PRIVACY.md"), `${await read("docs/PRIVACY.md")}\nA new sentence.\n`);
    const after = await renderLlmsFull(root);
    assert.notEqual(after, before);
    assert.ok(after.includes("A new sentence."));
    await access(join(root, "docs", "llms.txt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the index tells agents what matters most, and states the limit that matters most", () => {
  assert.match(index, /check_dependency/);
  assert.match(index, /`no-data` answer means Evergreen has no rule for the package, not that it is safe/);
  assert.match(index, /scans never use the network/);
});
