import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { builtInHostHooks, loadHostHooks } from "../src/agent-hooks/registry.js";

test("every module under hosts/ is a host whose adapter id is its file name", async () => {
  const hooks = await builtInHostHooks();
  const files = (await readdir(new URL("../src/agent-hooks/hosts/", import.meta.url)))
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.slice(0, -".js".length))
    .sort();
  assert.ok(files.length > 0);
  assert.deepEqual(
    hooks.map((hook) => hook.adapter.id),
    files,
  );
  assert.equal(new Set(files).size, files.length);
});

test("a host dropped into the directory is discovered without editing any list", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-hosts-"));
  await writeFile(
    join(directory, "zed.js"),
    'export const hostHook = { adapter: { id: "zed", parse: () => undefined, respond: () => ({ stdout: "", stderr: "", exitCode: 0 }) }, setup: async () => "ok\\n" };\n',
  );
  const hooks = await loadHostHooks(pathToFileURL(`${directory}/`));
  assert.deepEqual(
    hooks.map((hook) => hook.adapter.id),
    ["zed"],
  );
  assert.equal(await hooks[0]!.setup({ root: ".", dryRun: true }), "ok\n");
});

test("a module without hostHook is refused by name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-hosts-"));
  await writeFile(join(directory, "broken.js"), "export const other = 1;\n");
  await assert.rejects(loadHostHooks(pathToFileURL(`${directory}/`)), /broken\.js does not export hostHook/);
});

test("init --hooks-for names every discovered host in its refusal", async () => {
  const ids = (await builtInHostHooks()).map((hook) => hook.adapter.id);
  const result = spawnSync(process.execPath, [resolve("dist/src/cli.js"), "init", "--hooks-for", "nope"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  for (const id of ids) assert.ok(result.stderr.includes(id), id);
});
