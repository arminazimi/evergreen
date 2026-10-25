import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { AgentFileError } from "../src/agent-instructions.js";
import { initPersonal } from "../src/init-personal.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const machine = async () => {
  const home = await mkdtemp(join(tmpdir(), "evergreen-personal-"));
  roots.push(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };
  return { home, env, hooks: join(home, ".config", "evergreen", "git-hooks"), config: join(home, ".config", "evergreen", "config.json") };
};
const yes = async () => true;

test("--dry-run writes nothing and shows a diff", async () => {
  const { env, hooks, config } = await machine();
  const result = await initPersonal({ gate: "high", dryRun: true, env });
  assert.equal(result.written, false);
  assert.ok(result.diff.includes("--fail-on high"));
  await assert.rejects(stat(config));
  await assert.rejects(stat(join(hooks, "pre-push")));
});

test("declining changes nothing", async () => {
  const { env, config } = await machine();
  const result = await initPersonal({ gate: "high", env, confirm: async () => false });
  assert.equal(result.change, "declined");
  await assert.rejects(stat(config));
});

test("it writes the config and hook, sets the global hooks path, and is safe to repeat", async () => {
  const { env, hooks, config } = await machine();
  assert.equal((await initPersonal({ gate: "medium", env, confirm: yes })).change, "created");
  assert.deepEqual(JSON.parse(await readFile(config, "utf8")), { failOn: "medium" });
  assert.ok((await readFile(join(hooks, "pre-push"), "utf8")).includes("--fail-on medium"));
  const path = spawnSync("git", ["config", "--global", "core.hooksPath"], { env, encoding: "utf8" }).stdout.trim();
  assert.equal(path, hooks);
  assert.equal((await initPersonal({ gate: "medium", env, confirm: yes })).change, "unchanged");
  assert.equal((await initPersonal({ gate: "low", env, confirm: yes })).change, "updated");
});

test("a different global hooks path is left alone", async () => {
  const { env } = await machine();
  spawnSync("git", ["config", "--global", "core.hooksPath", "/somewhere/else"], { env });
  await assert.rejects(initPersonal({ gate: "high", env, confirm: yes }), AgentFileError);
});

test("the hook runs in a fresh repository and still runs the repository's own pre-push", async (t) => {
  if (process.platform === "win32") return t.skip("shell hooks");
  const { home, env } = await machine();
  await initPersonal({ gate: "high", env, confirm: yes });
  const repo = join(home, "repo");
  await mkdir(repo);
  const remote = join(home, "remote.git");
  spawnSync("git", ["init", "-q", "--bare", remote], { env });
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo, env });
  const marker = join(home, "repo-hook-ran");
  await writeFile(join(repo, ".git", "hooks", "pre-push"), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  const git = (...args: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, env: { ...env, EVERGREEN_SKIP: "1" }, encoding: "utf8" });
  git("commit", "-q", "--allow-empty", "-m", "x");
  const push = git("push", remote, "main");
  assert.equal(push.status, 0, push.stderr);
  await stat(marker);
});
