import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { commands as registeredCommands } from "../src/commands/index.generated.js";
import { getCapabilityManifest } from "../src/capabilities.js";
import {
  README_DESCRIPTIONS_PATH,
  README_END_MARKER,
  README_PATH,
  README_START_MARKER,
  buildDocument,
  buildReadmeDocument,
  loadReadmeDescriptions,
  validateReadmeDescriptions,
} from "../tools/coverage-matrix.js";
const read = (path: string) => readFile(resolve(path), "utf8");
/** A detector split across files is read as one source, so each file it reads appears somewhere in it. */
async function readDirectory(path: string): Promise<string> {
  const entries = (await readdir(resolve(path))).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(entries.map((name) => read(`${path}/${name}`)))).join("\n");
}
const readme = await read(README_PATH);
const manifest = JSON.parse(await read("package.json")) as {
  description: string;
  keywords: string[];
  bin: Record<string, string>;
};

const temporaryRoots: string[] = [];
after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test("the committed README coverage table matches the generator", async () => {
  assert.equal(readme, await buildReadmeDocument(), "run: npm run build:coverage");
  assert.equal(readme.match(new RegExp(README_START_MARKER, "g"))?.length, 1, "one start marker");
  assert.equal(readme.match(new RegExp(README_END_MARKER, "g"))?.length, 1, "one end marker");
});

test("every ecosystem the capability manifest lists has exactly one README row", async () => {
  const descriptions = await loadReadmeDescriptions();
  validateReadmeDescriptions(getCapabilityManifest(), descriptions);
  const described = descriptions.rows.flatMap((row) => row.ecosystems);
  assert.deepEqual(
    [...described].sort(),
    getCapabilityManifest()
      .ecosystems.map((ecosystem) => ecosystem.id)
      .sort(),
  );
});

test("every file the README says Evergreen reads appears in that detector's source", async () => {
  const descriptions = await loadReadmeDescriptions();
  const readsFor = (id: string) => {
    const row = descriptions.rows.find((candidate) => candidate.ecosystems.includes(id));
    assert.ok(row, `no README row for ${id}`);
    return row.reads;
  };
  const sources = {
    go: await read("src/detectors/go/index.ts"),
    "github-actions": await read("src/detectors/github-actions.ts"),
    npm: await read("src/detectors/npm.ts"),
    nodejs: await read("src/detectors/npm.ts"),
    python: await readDirectory("src/detectors/python"),
    rust: await read("src/detectors/rust/index.ts"),
  } as const;
  for (const [ecosystem, source] of Object.entries(sources)) {
    const files = [...readsFor(ecosystem).matchAll(/`([^`]+)`/g)]
      .map((match) => match[1]!)
      .filter((name) => /[.\-]/.test(name) || name === "volta");
    assert.ok(files.length >= (ecosystem === "github-actions" ? 1 : ecosystem === "go" ? 2 : 3), ecosystem);
    for (const file of files) {
      // Patterns such as requirements*.txt and .github/workflows/*.yml are checked by their stable part.
      const stable = file
        .replace(/^\.github\/workflows\/\*\.yml$/, ".github")
        .replace(/\*\.txt$/, "")
        .replace(/\*\.yml$/, "")
        .replace(/\(\.toml\)$/, "");
      assert.ok(
        source.includes(stable.split("/")[0]!),
        `${ecosystem}: the README says it reads ${file}, but ${stable} is not in its detector`,
      );
    }
  }
});

test("a new registry rule needs no hand edit of the README or the compatibility matrix", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-readme-registry-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "registry"), { recursive: true });
  await writeFile(join(root, README_PATH), readme);
  await writeFile(join(root, README_DESCRIPTIONS_PATH), await read(README_DESCRIPTIONS_PATH));
  await writeFile(join(root, "docs/COMPATIBILITY.md"), await read("docs/COMPATIBILITY.md"));
  await writeFile(join(root, "docs/coverage-descriptions.json"), await read("docs/coverage-descriptions.json"));
  await writeFile(
    join(root, "registry/example.json"),
    JSON.stringify({ schemaVersion: "evergreen.registry.v2", rules: [{ id: "example.package.deprecated" }] }),
  );
  assert.equal(await buildReadmeDocument(root), readme);
  assert.equal(await buildDocument(root), await read("docs/COMPATIBILITY.md"));
});

test("each ecosystem in the README rows has a registry with rules", async () => {
  const described = (await loadReadmeDescriptions()).rows.flatMap((row) => row.ecosystems);
  for (const registry of ["go", "github-actions", "nodejs", "npm", "python", "rust"]) {
    assert.ok(described.includes(registry), `${registry} is listed in the README`);
    const rules = (JSON.parse(await read(`registry/${registry}.json`)) as { rules: unknown[] }).rules;
    assert.ok(rules.length > 0, registry);
  }
});

test("the README links resolve and its commands exist", async () => {
  for (const link of new Set(
    [...readme.matchAll(/\]\((?!https?:|#)([^)#\s]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!),
  ))
    await access(resolve(link));
  assert.ok(
    manifest.bin["evergreen-deprecation"],
    "every `npx evergreen-deprecation …` command in the README needs a bin of that name",
  );
  const mentioned = [...readme.matchAll(/npx evergreen-deprecation ([a-z-]+)/g)].map((match) => match[1]!);
  const registered = new Set(registeredCommands.map((command) => command.name));
  for (const command of new Set(mentioned))
    assert.ok(registered.has(command), `the README uses \`${command}\`, which the CLI does not implement`);
  assert.ok(readme.includes("https://arminazimi.github.io/evergreen/llms.txt"));
});

test("the npm description and keywords are specific, unique, and within bounds", () => {
  assert.ok(
    manifest.description.length >= 80 && manifest.description.length <= 200,
    `description length ${manifest.description.length}`,
  );
  for (const term of ["end-of-life", "deprecated", "runtimes", "packages", "GitHub Actions", "MCP"])
    assert.ok(manifest.description.includes(term), `the description should mention ${term}`);
  assert.equal(new Set(manifest.keywords).size, manifest.keywords.length, "no duplicate keywords");
  assert.ok(
    manifest.keywords.every((keyword) => /^[a-z0-9-]+$/.test(keyword)),
    "lowercase single-token keywords",
  );
  for (const keyword of [
    "deprecation",
    "end-of-life",
    "eol",
    "lifecycle",
    "github-actions",
    "npm",
    "python",
    "mcp",
    "sarif",
  ])
    assert.ok(manifest.keywords.includes(keyword), keyword);
  assert.ok(manifest.keywords.length >= 15 && manifest.keywords.length <= 25);
});
