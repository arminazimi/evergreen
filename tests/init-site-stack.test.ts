import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { planInitSetup } from "../src/init.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const starterDirectory = resolve("examples/starters/slipway");

const JEKYLL_CONFIG = "title: Documentation\ndescription: A small Jekyll site.\n";
const JEKYLL_GEMFILE = 'source "https://rubygems.org"\n\ngem "github-pages", "~> 232"\n';
const SLIPWAY_GEMFILE = 'source "https://rubygems.org"\n\ngem "slipway-theme", "~> 0.1"\n';

const repository = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-init-site-"));
  roots.push(root);
  spawnSync("git", ["init", "-q"], { cwd: root });
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, dirname(name)), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

const exercise = (root: string, args: string[]) =>
  spawnSync(process.execPath, [resolve("dist/src/cli.js"), "init", ...args, root], { encoding: "utf8" });

const command = (root: string) => `cp -R ${JSON.stringify(starterDirectory)}/. ${JSON.stringify(root)}`;

test("a Slipway site is pointed at the Slipway starter and nothing is copied", async () => {
  const root = await repository({ "_config.yml": JEKYLL_CONFIG, Gemfile: SLIPWAY_GEMFILE });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.deepEqual(plan.site, { stack: "Slipway", directory: starterDirectory, command: command(root) });

  const run = exercise(root, ["--yes"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Detected a Slipway site\. Evergreen ships a starter for it; copy it with:\n\n {2}cp -R /);
  assert.ok(run.stdout.includes(command(root)), run.stdout);
  assert.match(run.stdout, /Nothing was copied\.\n/);
  await assert.rejects(readFile(join(root, ".evergreen.json"), "utf8"), "init copies the starter only when the user runs the command");
  assert.match(await readFile(join(root, "AGENTS.md"), "utf8"), /evergreen:begin/);
});

test("a plain Jekyll site is recognized, and a commented-out Slipway gem is not Slipway", async () => {
  const root = await repository({
    "_config.yml": JEKYLL_CONFIG,
    Gemfile: `${JEKYLL_GEMFILE}\n# gem "slipway-theme", "~> 0.1"\n`,
  });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.equal(plan.site?.stack, "Jekyll");

  const run = exercise(root, ["--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Detected a Jekyll site\./);
  assert.ok(run.stdout.includes(command(root)), run.stdout);
  assert.match(run.stdout, /Dry run: nothing was written\.\n$/);
});

test("both _config.yml and Gemfile are required, and neither file is read as anything but text", async () => {
  for (const files of [{ "_config.yml": JEKYLL_CONFIG }, { Gemfile: SLIPWAY_GEMFILE }]) {
    const root = await repository(files);
    const plan = await planInitSetup({ root, gate: "high" });
    assert.equal(plan.site, undefined, Object.keys(files).join(","));
  }
});

test("a repository that is not a Jekyll site sees no site suggestion", async () => {
  const root = await repository({ "package.json": '{"name":"app","version":"1.0.0"}\n', ".github/workflows/ci.yml": "name: Build\n" });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.equal(plan.site, undefined);

  const run = exercise(root, ["--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Detected: GitHub Actions; no agent hosts\n/);
  assert.doesNotMatch(run.stdout, /Jekyll|Slipway|starter|cp -R/);
});
