import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-pins-"));
  temporaryRoots.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents);
  return root;
}

async function fix(root: string): Promise<string> {
  return (await execute(process.execPath, [cli, "fix", root, "--dry-run"])).stdout;
}

test("moves exact pins past every active rule in one pass and keeps the v prefix", async () => {
  const root = await repository({
    ".nvmrc": "v20.11.0\n",
    ".python-version": "3.9.18\n",
    "package.json": `{\n  "name": "app",\n  "engines": {\n    "node": "18.19.0"\n  }\n}\n`,
  });
  const stdout = await fix(root);

  // 22 is skipped: its scheduled end of life is an active rule, so landing there would need a second pass.
  assert.match(stdout, /^-v20\.11\.0\n\+v24\n/m);
  assert.match(stdout, /^-3\.9\.18\n\+3\.11\n/m);
  assert.match(stdout, /^-    "node": "18\.19\.0"\n\+    "node": "24"\n/m);

  const patch = join(root, "fix.patch");
  await writeFile(patch, stdout);
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["apply", "--check", patch], { cwd: root });
  assert.equal(await readFile(join(root, ".nvmrc"), "utf8"), "v20.11.0\n");
});

test("moves a pin past a scheduled end-of-life line in the same pass", async () => {
  const root = await repository({ ".nvmrc": "v22\n", "package.json": `{\n  "name": "app"\n}\n` });

  assert.match(await fix(root), /^-v22\n\+v24\n/m);
});

test("never rewrites a range", async () => {
  const root = await repository({
    ".nvmrc": ">=18\n",
    ".node-version": "18.x\n",
    "package.json": `{\n  "engines": {\n    "node": ">=18 <21"\n  }\n}\n`,
  });
  const stdout = await fix(root);

  assert.doesNotMatch(stdout, /\.nvmrc|\.node-version|package\.json/);
});

test("leaves a pin alone when no rule covers it", async () => {
  const root = await repository({ ".nvmrc": "24\n", ".python-version": "3.13\n" });

  assert.equal(await fix(root), "");
});
