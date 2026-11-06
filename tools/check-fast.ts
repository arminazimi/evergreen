// `npm run check:fast`: a quick local answer before `npm run check`.
//
// Runs the formatter check, type-aware lint, and only the tests that a change can affect. The
// merge queue and CI still run everything; this command never replaces `npm run check`.
//
// A changed test file runs itself. A changed source file runs the tests named after it
// (`src/foo.ts` -> `tests/foo.test.ts` and `tests/foo-*.test.ts`). A change to a file with no such
// mapping (configuration, registry, build tooling) is reported, and the full suite is the safe
// answer for it.

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_DIRS = ["src/", "tools/", "benchmarks/"];
const IGNORED_PREFIXES = ["docs/", "dist/", "plugins/", ".github/ISSUE_TEMPLATE/"];
const IGNORED_FILES = new Set(["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md"]);

export interface AffectedTests {
  tests: string[];
  /** Changed files that no test is known to cover; run `npm run check` for these. */
  unmapped: string[];
}

function isTestFile(file: string): boolean {
  return file.startsWith("tests/") && file.endsWith(".test.ts");
}

/**
 * Test-name stems a source file can map to: its own file name and each directory between `src/`
 * and the file. A module moved into a folder (`src/engine/detect.ts`) still maps to its area's
 * tests (`tests/engine-*.test.ts`).
 */
function testStems(file: string): string[] {
  const parts = file.replace(/\.ts$/, "").split("/");
  const base = parts[parts.length - 1];
  const stems = new Set<string>(base ? [base] : []);
  for (let index = 1; index < parts.length - 1; index += 1) {
    const directory = parts[index];
    if (directory) stems.add(directory);
  }
  return [...stems];
}

/** Pick the test files a set of changed repository paths can affect. */
export function selectAffectedTests(changedFiles: readonly string[], allTestFiles: readonly string[]): AffectedTests {
  const tests = new Set<string>();
  const unmapped: string[] = [];
  for (const file of changedFiles) {
    if (isTestFile(file)) {
      if (allTestFiles.includes(file)) tests.add(file);
      continue;
    }
    if (IGNORED_FILES.has(file) || IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)) || file.endsWith(".md")) {
      continue;
    }
    if (file.startsWith("tests/") || !SOURCE_DIRS.some((prefix) => file.startsWith(prefix)) || !file.endsWith(".ts")) {
      unmapped.push(file);
      continue;
    }
    const matches = allTestFiles.filter((test) => {
      const testStem = basename(test, ".test.ts");
      return testStems(file).some((stem) => testStem === stem || testStem.startsWith(`${stem}-`));
    });
    if (matches.length === 0) unmapped.push(file);
    for (const match of matches) tests.add(match);
  }
  return { tests: [...tests].sort(), unmapped: unmapped.sort() };
}

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function capture(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise(out) : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function changedFiles(): Promise<string[]> {
  const base = (await capture("git", ["merge-base", "HEAD", "origin/main"])).trim();
  const committed = await capture("git", ["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`]);
  const working = await capture("git", ["diff", "--name-only", "--diff-filter=d", "HEAD"]);
  const untracked = await capture("git", ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set(`${committed}\n${working}\n${untracked}`.split("\n").filter(Boolean))].sort();
}

async function main(): Promise<void> {
  const started = Date.now();
  const files = await changedFiles();
  if (files.length === 0) {
    console.log("check:fast: no changes against origin/main.");
    return;
  }
  const lintable = files.filter((file) => /^(src|tools)\/.*\.ts$/.test(file));
  const formattable = files.filter((file) => /\.(ts|mjs|json|jsonc)$/.test(file));

  if (formattable.length > 0) await run("npx", ["biome", "format", ...formattable]);
  await run("npx", ["tsc", "-b", "tsconfig.json"]);
  if (lintable.length > 0) await run("npx", ["eslint", "--max-warnings=0", ...lintable]);

  const allTests = (await readdir("tests")).filter((name) => name.endsWith(".test.ts")).map((name) => `tests/${name}`);
  const { tests, unmapped } = selectAffectedTests(files, allTests);
  if (tests.length > 0) {
    await run("node", [
      "--test",
      ...tests.map((test) => test.replace(/^tests\//, "dist/tests/").replace(/\.ts$/, ".js")),
    ]);
  }
  if (unmapped.length > 0) {
    console.log(`check:fast: no matching test for ${unmapped.join(", ")}.`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `check:fast passed in ${seconds}s. The merge queue still runs everything; run \`npm run check\` before opening a pull request.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
