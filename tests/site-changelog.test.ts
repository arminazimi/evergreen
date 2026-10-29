import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the site changelog carries a stable anchor and heading for every release", async () => {
  const [source, site] = await Promise.all([readFile("CHANGELOG.md", "utf8"), readFile("docs/CHANGELOG.md", "utf8")]);
  const headings = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
  assert.ok(headings.length > 0, "CHANGELOG.md has no release headings");
  for (const heading of headings) {
    const version = heading.split(/\s+/)[0]!;
    const anchor = version.toLowerCase() === "unreleased" ? "unreleased" : `v${version}`;
    assert.ok(site.includes(`<a id="${anchor}"></a>`), `docs/CHANGELOG.md is missing the ${anchor} anchor; copy the release from CHANGELOG.md`);
    assert.ok(site.includes(`## ${heading}`), `docs/CHANGELOG.md is missing the ${heading} heading; copy the release from CHANGELOG.md`);
  }
});
