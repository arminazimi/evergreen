import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { AgentFileError } from "../src/agent-instructions.js";
import { HOOK_BEGIN, HOOK_END, hookBlock, initHooks, withHookBlock } from "../src/init-hooks.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const repository = async (files: Record<string, string> = {}, git = true) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-hooks-"));
  roots.push(root);
  if (git) spawnSync("git", ["init", "-q"], { cwd: root });
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

const hookPath = (root: string) => join(root, ".git", "hooks", "pre-push");
const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [resolve("dist/src/cli.js"), "init", ...args, root], { encoding: "utf8" });

test("a repository without a pre-push hook gets an executable one with the gate in it", async () => {
  const root = await repository();
  const result = await initHooks({ root, gate: "high" });
  assert.equal(result.change, "created");
  const text = await readFile(hookPath(root), "utf8");
  assert.ok(text.startsWith("#!/bin/sh\n"));
  assert.ok(text.includes("--fail-on high"));
  if (process.platform !== "win32") assert.ok(((await stat(hookPath(root))).mode & 0o111) !== 0, "the hook is executable");
});

test("running it again changes nothing, and a new gate updates the block in place", async () => {
  const root = await repository();
  await initHooks({ root, gate: "high" });
  const first = await readFile(hookPath(root), "utf8");
  assert.equal((await initHooks({ root, gate: "high" })).change, "unchanged");
  assert.equal(await readFile(hookPath(root), "utf8"), first);
  assert.equal((await initHooks({ root, gate: "medium" })).change, "updated");
  const updated = await readFile(hookPath(root), "utf8");
  assert.ok(updated.includes("--fail-on medium") && !updated.includes("--fail-on high"));
  assert.equal(updated.split(HOOK_BEGIN).length, 2, "one block only");
});

test("a dry run writes nothing", async () => {
  const root = await repository();
  const result = await initHooks({ root, gate: "high", dryRun: true });
  assert.equal(result.change, "created");
  assert.equal(result.written, false);
  assert.match(result.diff, /evergreen-deprecation scan/);
  await assert.rejects(stat(hookPath(root)));
});

test("a hook that Evergreen does not manage is left alone", async () => {
  const root = await repository();
  await mkdir(join(root, ".git", "hooks"), { recursive: true });
  await writeFile(hookPath(root), "#!/bin/sh\necho mine\n");
  await assert.rejects(initHooks({ root, gate: "high" }), AgentFileError);
  assert.equal(await readFile(hookPath(root), "utf8"), "#!/bin/sh\necho mine\n");
});

test("text around the block survives an update", () => {
  const before = `#!/bin/sh\necho first\n\n${hookBlock("high")}\necho last\n`;
  const result = withHookBlock(before, "low");
  assert.equal(result.change, "updated");
  assert.ok(result.text.startsWith("#!/bin/sh\necho first\n\n") && result.text.endsWith(`${HOOK_END}\necho last\n`));
});

test("husky and lefthook keep their hooks; Evergreen prints what to add", async () => {
  const husky = await repository({ ".husky/pre-commit": "npm test\n" });
  const huskyResult = await initHooks({ root: husky, gate: "high" });
  assert.deepEqual([huskyResult.change, huskyResult.manager, huskyResult.written], ["managed", "husky", false]);
  await assert.rejects(stat(hookPath(husky)));
  const lefthook = await repository({ "lefthook.yml": "pre-commit:\n" });
  const lefthookResult = await initHooks({ root: lefthook, gate: "high" });
  assert.equal(lefthookResult.manager, "lefthook");
  assert.match(lefthookResult.snippet ?? "", /pre-push:/);
});

test("outside a Git repository there is nothing to install into", async () => {
  const root = await repository({}, false);
  await assert.rejects(initHooks({ root, gate: "high" }), /not inside a Git repository/);
});

test("init --hooks --agents sets up both, and scan --fail-on gates the exit code", async () => {
  const root = await repository({ "package.json": JSON.stringify({ name: "x", engines: { node: "14" } }) });
  const both = cli(root, "--agents", "--hooks");
  assert.equal(both.status, 0, both.stderr);
  assert.match(await readFile(hookPath(root), "utf8"), /evergreen pre-push/);
  assert.match(await readFile(join(root, "AGENTS.md"), "utf8"), /Evergreen/);
  const scan = (gate: string) => spawnSync(process.execPath, [resolve("dist/src/cli.js"), "scan", root, "--fail-on", gate], { encoding: "utf8" });
  assert.equal(scan("none").status, 0);
  assert.equal(scan("critical").status === 0 || scan("critical").status === 1, true);
  assert.equal(scan("bogus").status, 2);
  assert.equal(cli(root, "--hooks", "--fail-on", "bogus").status, 2);
  assert.equal(cli(root, "--fail-on", "high").status, 2);
});
