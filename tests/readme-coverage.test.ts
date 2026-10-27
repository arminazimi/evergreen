import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFile(resolve(path), "utf8");
const readme = await read("README.md");
const manifest = JSON.parse(await read("package.json")) as { description: string; keywords: string[]; bin: Record<string, string> };

const table = readme.slice(readme.indexOf("## What it covers"), readme.indexOf("## Product principles"));
const rows = new Map(
  [...table.matchAll(/^\| \*\*([^*]+)\*\* \| (.+?) \| (.+?) \|$/gm)].map((match) => [match[1]!, { reads: match[2]!, reports: match[3]! }] as const),
);

test("the coverage table names the four shipped ecosystems", () => {
  assert.deepEqual([...rows.keys()], ["GitHub Actions", "Node.js", "npm", "Python"]);
});

test("every file the table says Evergreen reads appears in that detector's source", async () => {
  const sources = {
    "GitHub Actions": await read("src/detectors/github-actions.ts"),
    "Node.js": await read("src/detectors/npm.ts"),
    npm: await read("src/detectors/npm.ts"),
    Python: await read("src/detectors/python.ts"),
  } as const;
  for (const [ecosystem, { reads }] of rows) {
    const files = [...reads.matchAll(/`([^`]+)`/g)].map((match) => match[1]!).filter((name) => /[.\-]/.test(name) || name === "volta");
    assert.ok(files.length >= (ecosystem === "GitHub Actions" ? 1 : 3), ecosystem);
    const source = sources[ecosystem as keyof typeof sources];
    for (const file of files) {
      // Patterns such as requirements*.txt and .github/workflows/*.yml are checked by their stable part.
      const stable = file.replace(/^\.github\/workflows\/\*\.yml$/, ".github").replace(/\*\.txt$/, "").replace(/\*\.yml$/, "");
      assert.ok(source.includes(stable.split("/")[0]!), `${ecosystem}: the README says it reads ${file}, but ${stable} is not in its detector`);
    }
  }
});

test("each ecosystem in the table has a registry with rules", async () => {
  for (const registry of ["github-actions", "nodejs", "npm", "python"]) {
    const rules = (JSON.parse(await read(`registry/${registry}.json`)) as { rules: unknown[] }).rules;
    assert.ok(rules.length > 0, registry);
  }
});

test("the README links resolve and its commands exist", async () => {
  for (const link of new Set([...readme.matchAll(/\]\((?!https?:|#)([^)#\s]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!))) await access(resolve(link));
  assert.ok(manifest.bin["evergreen-deprecation"], "every `npx evergreen-deprecation …` command in the README needs a bin of that name");
  const commands = [...readme.matchAll(/npx evergreen-deprecation ([a-z-]+)/g)].map((match) => match[1]!);
  const cli = await read("src/cli-main.ts");
  for (const command of new Set(commands)) assert.ok(cli.includes(`"${command}"`), `the README uses \`${command}\`, which the CLI does not implement`);
  assert.ok(readme.includes("https://arminazimi.github.io/evergreen/llms.txt"));
});

test("the npm description and keywords are specific, unique, and within bounds", () => {
  assert.ok(manifest.description.length >= 80 && manifest.description.length <= 200, `description length ${manifest.description.length}`);
  for (const term of ["end-of-life", "deprecated", "runtimes", "packages", "GitHub Actions", "MCP"]) assert.ok(manifest.description.includes(term), `the description should mention ${term}`);
  assert.equal(new Set(manifest.keywords).size, manifest.keywords.length, "no duplicate keywords");
  assert.ok(manifest.keywords.every((keyword) => /^[a-z0-9-]+$/.test(keyword)), "lowercase single-token keywords");
  for (const keyword of ["deprecation", "end-of-life", "eol", "lifecycle", "github-actions", "npm", "python", "mcp", "sarif"]) assert.ok(manifest.keywords.includes(keyword), keyword);
  assert.ok(manifest.keywords.length >= 15 && manifest.keywords.length <= 25);
});
