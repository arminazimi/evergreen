import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFile(resolve(path), "utf8");

test("docs/ARCHITECTURE.md links only to paths that exist", async () => {
  const text = await read("docs/ARCHITECTURE.md");
  const links = new Set([...text.matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)].map((match) => match[1]!));
  assert.ok(links.size >= 20);
  for (const link of links) await access(resolve("docs", link));
});

test("docs/ARCHITECTURE.md names every layer in the decision record", async () => {
  const text = await read("docs/ARCHITECTURE.md");
  for (const layer of ["Domain", "Detector SDK", "Core", "Detectors", "Services", "Reporters", "Adapters"]) {
    assert.ok(text.includes(`| ${layer} |`), `${layer} layer should be listed`);
  }
});
