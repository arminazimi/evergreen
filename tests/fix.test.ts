import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const WORKFLOW = `name: CI
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: "actions/setup-node@v4" # old runtime
      - uses: actions/cache@v4.2.0
      - uses: actions/upload-artifact@v6
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4.1.1
`;

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  return root;
}

test("fix prints a patch that git apply accepts and writes nothing", async () => {
  const root = await repository();
  const { stdout } = await execute(process.execPath, [cli, "fix", root, "--dry-run"]);

  assert.match(stdout, /^--- a\/\.github\/workflows\/ci\.yml\n\+\+\+ b\/\.github\/workflows\/ci\.yml\n/);
  assert.match(stdout, /\+      - uses: actions\/checkout@v5\n/);
  assert.match(stdout, /\+      - uses: "actions\/setup-node@v5" # old runtime\n/);
  assert.match(stdout, /\+      - uses: actions\/cache@v5\n/);
  assert.match(stdout, /\+      - uses: actions\/upload-artifact@v7\n/);
  assert.doesNotMatch(stdout, /^\+.*0123456789abcdef/m);
  assert.equal(await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"), WORKFLOW);

  const patch = join(root, "fix.patch");
  await writeFile(patch, stdout);
  await execute("git", ["apply", "--check", patch], { cwd: root });
  await execute("git", ["apply", patch], { cwd: root });
  // git apply on Windows may convert line endings to CRLF.
  const fixed = (await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8")).replace(/\r\n/g, "\n");
  assert.match(fixed, /actions\/checkout@v5\n/);
  assert.match(fixed, /@0123456789abcdef0123456789abcdef01234567 # v4\.1\.1/);

  const again = await execute(process.execPath, [cli, "fix", root]);
  assert.equal(again.stdout, "");
});

test("fix reports nothing to do and rejects unknown flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-"));
  temporaryRoots.push(root);
  const clean = await execute(process.execPath, [cli, "fix", root]);
  assert.equal(clean.stdout, "");
  assert.match(clean.stderr, /No deterministic fixes/);

  await assert.rejects(execute(process.execPath, [cli, "fix", root, "--write"]), (error: { code?: number }) => error.code === 2);
});
