import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { after, test } from "node:test";

// A playbook marks a runnable example with an HTML comment on the line before its bash fence:
//   <!-- testable -->           every command must exit 0
//   <!-- testable expect=1 -->  every command must exit 1 (for examples that show a gate failing)
// Unmarked fences are prose, network calls, or snippets that need a checkout the test does not have.

const root = resolve(import.meta.dirname, "../..");
const cli = resolve(root, "dist/src/cli.js");
const directory = resolve(root, "docs/playbooks");
const marker = /^<!-- testable(?: expect=(\d+))? -->$/;

interface ExampleBlock {
  file: string;
  line: number;
  expected: number;
  commands: string[];
}

function testableBlocks(file: string, markdown: string): ExampleBlock[] {
  const lines = markdown.split("\n");
  const blocks: ExampleBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = marker.exec(lines[index]!.trim());
    if (match === null) continue;
    const fence = index + 1;
    if (lines[fence]?.trim() !== "```bash") {
      throw new Error(`${file}:${index + 1}: a testable marker must be followed by a bash code fence`);
    }
    const commands: string[] = [];
    let cursor = fence + 1;
    while (cursor < lines.length && lines[cursor]!.trim() !== "```") {
      const command = lines[cursor]!.trim();
      if (command.length > 0 && !command.startsWith("#")) commands.push(command);
      cursor += 1;
    }
    if (cursor === lines.length) throw new Error(`${file}:${fence}: the bash code fence is never closed`);
    if (commands.length === 0) throw new Error(`${file}:${fence}: a testable block needs at least one command`);
    blocks.push({ file, line: fence, expected: match[1] === undefined ? 0 : Number(match[1]), commands });
    index = cursor;
  }
  return blocks;
}

async function exampleBlocks(): Promise<ExampleBlock[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".md")).sort();
  const blocks = await Promise.all(
    files.map(async (file) => testableBlocks(file, await readFile(join(directory, file), "utf8"))),
  );
  return blocks.flat();
}

/** Splits a playbook command line into arguments, honoring quotes and trailing `#` comments. */
function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let quoted: string | undefined;
  let started = false;
  for (const character of command) {
    if (quoted !== undefined) {
      if (character === quoted) quoted = undefined;
      else word += character;
    } else if (character === "'" || character === '"') {
      quoted = character;
      started = true;
    } else if (character === "#" && !started) {
      break;
    } else if (character === " " || character === "\t") {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
    } else {
      word += character;
      started = true;
    }
  }
  if (quoted !== undefined) throw new Error(`unbalanced quote in playbook command: ${command}`);
  if (started) words.push(word);
  return words;
}

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(temporaryDirectories.map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "evergreen-playbooks-"));
  temporaryDirectories.push(path);
  // The declaration sits on line 1 so the docs' example id, `nodejs.runtime.eol-18:package.json:1`, is the one this fixture produces.
  await writeFile(join(path, "package.json"), '{"name":"playbook-example","private":true,"engines":{"node":">=18"}}\n');
  const git = spawnSync("git", ["init", "--quiet"], { cwd: path, encoding: "utf8" });
  assert.equal(git.status, 0, `git init failed: ${git.stderr}`);
  return path;
}

test("the playbooks mark the examples CI can run", async () => {
  const blocks = await exampleBlocks();
  assert.ok(blocks.length >= 10, `only ${blocks.length} testable blocks found; examples that run in CI need the marker`);
});

test("testable playbook examples run against a fixture repository", async () => {
  const path = await fixture();
  for (const block of await exampleBlocks()) {
    for (const command of block.commands) {
      const [program, ...args] = shellWords(command);
      const where = `${relative(root, join(directory, block.file))}:${block.line}`;
      assert.equal(program, "evergreen", `${where}: mark only Evergreen commands as testable; found ${JSON.stringify(program)}`);
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: path, encoding: "utf8", timeout: 60_000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      assert.equal(result.status, block.expected, `${where}: \`${command}\` exited ${result.status}, expected ${block.expected}\n${output}`);
    }
  }
});
