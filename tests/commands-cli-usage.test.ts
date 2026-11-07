import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { SECTION_BEGIN, SECTION_END } from "../src/agent-instructions.js";
import { badgeSnippet } from "../src/badge.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A throwaway repository directory; `files` are written relative to it. */
async function repository(name: string, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(root);
  for (const [file, contents] of Object.entries(files)) await writeFile(join(root, file), contents);
  return root;
}

/** `git init` in a temporary root, so `init --hooks` has a real `.git/hooks` to write into. */
async function gitInit(root: string): Promise<void> {
  const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
}

const nodeRepository = () => repository("usage", { "package.json": '{"engines":{"node":"18"}}' });

test("badge: every flag that needs a value fails with the usage line", async () => {
  const root = await nodeRepository();
  for (const args of [["--snippet"], ["--repo"], ["--branch"], ["--snippet", root, "--repo"]]) {
    const run = await runCli(["badge", ...args]);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen badge \[path\] --snippet/);
  }
});

test("badge: an unknown flag, two paths, and a missing snippet format all fail as usage", async () => {
  const root = await nodeRepository();
  const other = await repository("usage-b");
  for (const args of [["--nope"], [root, other], [] as string[]]) {
    const run = await runCli(["badge", ...args]);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen badge/);
  }
});

test("badge: --shields rejects the snippet flags it ignores", async () => {
  const root = await nodeRepository();
  for (const args of [
    ["--repo", "acme/widgets"],
    ["--branch", "main"],
    ["--snippet", "markdown"],
  ]) {
    const run = await runCli(["badge", root, "--shields", ...args]);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen badge/);
  }
});

test("badge: --snippet with a --repo prints that repository and honours --branch", async () => {
  const root = await nodeRepository();
  const markdown = await runCli(["badge", root, "--snippet", "markdown", "--repo", "arminazimi/evergreen"]);
  assert.equal(markdown.code, 0, markdown.stderr);
  assert.equal(markdown.stdout.trim(), badgeSnippet("arminazimi/evergreen", "markdown"));

  const branch = await runCli([
    "badge",
    root,
    "--snippet",
    "html",
    "--repo",
    "arminazimi/evergreen",
    "--branch",
    "release",
  ]);
  assert.equal(branch.code, 0, branch.stderr);
  assert.match(branch.stdout, /arminazimi\/evergreen\/release\/evergreen-badge\.svg/);
});

test("badge: a repository the path cannot name, and a malformed --repo, both fail as usage", async () => {
  const root = await repository("usage-nogit");
  const noRemote = await runCli(["badge", root, "--snippet", "markdown"]);
  assert.equal(noRemote.code, 2);
  assert.match(noRemote.stderr, new RegExp(`Could not read a GitHub repository from ${escapeRegExp(root)}`));

  const malformed = await runCli(["badge", root, "--snippet", "markdown", "--repo", "acme/widgets/extra"]);
  assert.equal(malformed.code, 2);
  assert.match(malformed.stderr, /expected owner\/name/);
});

test("forecast: the output modes refuse each other", async () => {
  const root = await nodeRepository();
  const cases: Array<[string[], RegExp]> = [
    [["--animate"], /--animate needs --svg\./],
    [["--svg", "--json"], /Use either --svg or --json, not both\./],
    [["--timeline", "--json"], /Use either --timeline or --json, not both\./],
    [["--svg", "--timeline"], /Use either --svg or --timeline, not both\./],
    [["--timeline", "--format", "mermaid"], /Use either --timeline or --format mermaid, not both\./],
  ];
  for (const [flags, message] of cases) {
    const run = await runCli(["forecast", root, ...flags]);
    assert.equal(run.code, 2, flags.join(" "));
    assert.match(run.stderr, message);
  }
});

test("forecast: --months must be a whole number the horizon allows", async () => {
  const root = await nodeRepository();
  for (const value of ["0", "-1", "37", "1.5", "abc"]) {
    const run = await runCli(["forecast", root, "--months", value]);
    assert.equal(run.code, 2, value);
    assert.match(run.stderr, /--months must be a whole number from 1 to 36\./);
  }
});

test("forecast: --svg wins over --format mermaid and the plain and JSON renders stay available", async () => {
  const root = await nodeRepository();
  const svg = await runCli(["forecast", root, "--svg", "--format", "mermaid", "--as-of", "2026-10-25"]);
  assert.equal(svg.code, 0, svg.stderr);
  assert.match(svg.stdout, /^<svg/);

  const mermaid = await runCli(["forecast", root, "--format", "mermaid", "--as-of", "2026-10-25"]);
  assert.equal(mermaid.code, 0, mermaid.stderr);
  assert.match(mermaid.stdout, /^```mermaid/);

  const json = await runCli(["forecast", root, "--json", "--as-of", "2026-10-25"]);
  assert.equal(json.code, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).schemaVersion, "evergreen.forecast.v1");

  const text = await runCli(["forecast", root, "--as-of", "2026-10-25"], { env: { NO_COLOR: "1" } });
  assert.equal(text.code, 0, text.stderr);
  assert.doesNotMatch(text.stdout, /^<svg|^```mermaid/);
});

test("glance: a missing --as-of value and a second path fail with the usage line", async () => {
  const root = await nodeRepository();
  const other = await repository("glance-b");
  for (const args of [["--as-of"], [root, other], ["--as-of", root, other]]) {
    const run = await runCli(["glance", ...args]);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen glance/);
  }
});

test("glance: --json on a scanned path stays a facts document", async () => {
  const root = await nodeRepository();
  const run = await runCli(["glance", root, "--json", "--as-of", "2026-10-25"]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).asOf, "2026-10-25");
});

test("plan: unknown flags, a missing path pair, and a bare --wave fail as usage", async () => {
  const root = await nodeRepository();
  const other = await repository("plan-b");
  const unknown = await runCli(["plan", root, "--bogus"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Usage: evergreen plan/);
  const twoPaths = await runCli(["plan", root, other]);
  assert.equal(twoPaths.code, 2);
  assert.match(twoPaths.stderr, /Usage: evergreen plan/);
  const bareWave = await runCli(["plan", root, "--wave"]);
  assert.equal(bareWave.code, 2);
  assert.match(bareWave.stderr, /--wave needs a zero-based wave index\./);
  assert.match(bareWave.stderr, /Usage: evergreen plan/);
  const negativeWave = await runCli(["plan", root, "--wave", "-1"]);
  assert.equal(negativeWave.code, 2);
  assert.match(negativeWave.stderr, /Usage: evergreen plan/);
  const waveBeforeJson = await runCli(["plan", root, "--wave", "--json"]);
  assert.equal(waveBeforeJson.code, 2);
  assert.match(waveBeforeJson.stderr, /--wave needs a zero-based wave index\./);
});

test("plan: a non-numeric wave and a wave outside the built plan", async () => {
  const root = await nodeRepository();
  const notANumber = await runCli(["plan", root, "--wave", "abc"]);
  assert.equal(notANumber.code, 2);
  assert.match(notANumber.stderr, /--wave must be a whole number >= 0\./);

  const outOfRange = await runCli(["plan", root, "--wave", "42"]);
  assert.equal(outOfRange.code, 2);
  assert.match(outOfRange.stderr, /--wave is out of range: expected/);

  const empty = await repository("plan-empty");
  await writeFile(join(empty, "package.json"), '{"name":"empty","private":true}');
  const noWaves = await runCli(["plan", empty, "--wave", "0"]);
  assert.equal(noWaves.code, 2);
  assert.match(noWaves.stderr, /--wave is out of range: the plan has no waves\./);
});

test("init agent: its own usage lines cover --file, unknown flags, and two paths", async () => {
  const root = await nodeRepository();
  const other = await repository("agent-b");
  const badFile = await runCli(["init", "agent", root, "--file", "TYPING.md"]);
  assert.equal(badFile.code, 2);
  assert.match(badFile.stderr, /--file must be AGENTS\.md or CLAUDE\.md\./);
  for (const args of [["--bogus"], [other]]) {
    const run = await runCli(["init", "agent", root, ...args]);
    assert.equal(run.code, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen init agent/);
  }
});

test("init: the flag combinations that cannot mean one thing are refused", async () => {
  const root = await nodeRepository();
  const hooksFor = await runCli(["init", "--hooks-for", root]);
  assert.equal(hooksFor.code, 2);
  assert.match(hooksFor.stderr, /--hooks-for needs a host: claude-code, codex, cursor, gemini, copilot, or cline\./);
  const host = await runCli(["init", "--hooks-for", "gitlab", root]);
  assert.equal(host.code, 2);
  assert.match(host.stderr, /--hooks-for needs a host: claude-code, codex, cursor, gemini, copilot, or cline\./);

  const mixed = await runCli(["init", "--personal", "--hooks", root]);
  assert.equal(mixed.code, 2);
  assert.match(mixed.stderr, /--personal cannot be combined with --agents, --hooks, or --hooks-for\./);

  const file = await runCli(["init", "--hooks", "--file", "AGENTS.md", root]);
  assert.equal(file.code, 2);
  assert.match(file.stderr, /--file must be AGENTS\.md or CLAUDE\.md, and needs --agents or the guided init\./);

  const gate = await runCli(["init", "--hooks", "--fail-on", "bogus", root]);
  assert.equal(gate.code, 2);
  assert.match(gate.stderr, /--fail-on needs the guided init, --hooks or --personal, and a severity/);

  const gateless = await runCli(["init", "--agents", "--fail-on", "high", root]);
  assert.equal(gateless.code, 2);
  assert.match(gateless.stderr, /--fail-on needs the guided init, --hooks or --personal, and a severity/);

  const unknown = await runCli(["init", "--bogus", root]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Usage: evergreen init/);

  const personalPath = await runCli(["init", "--personal", root]);
  assert.equal(personalPath.code, 2);
  assert.match(personalPath.stderr, /Usage: evergreen init/);
});

test("init: the one-step flags print their result and change nothing on a dry run", async () => {
  const root = await nodeRepository();
  await gitInit(root);
  const created = await runCli(["init", "--agents", root]);
  assert.equal(created.code, 0, created.stderr);
  assert.match(created.stdout, /^Created AGENTS\.md\./);
  const again = await runCli(["init", "--agents", root]);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /^AGENTS\.md already has the current Evergreen section; nothing to change\./);

  await writeFile(join(root, "CLAUDE.md"), "# Rules\n\nUse tabs.\n");
  const addedPreview = await runCli(["init", "--agents", "--file", "CLAUDE.md", "--dry-run", root]);
  assert.equal(addedPreview.code, 0, addedPreview.stderr);
  assert.match(addedPreview.stdout, /^Would add the Evergreen section to CLAUDE\.md:/);
  const added = await runCli(["init", "--agents", "--file", "CLAUDE.md", root]);
  assert.equal(added.code, 0, added.stderr);
  assert.match(added.stdout, /^Added the Evergreen section to CLAUDE\.md\./);

  await writeFile(join(root, "AGENTS.md"), `${SECTION_BEGIN}\nAn old section.\n${SECTION_END}\n`);
  const updatedPreview = await runCli(["init", "--agents", "--dry-run", root]);
  assert.equal(updatedPreview.code, 0, updatedPreview.stderr);
  assert.match(updatedPreview.stdout, /^Would update the Evergreen section in AGENTS\.md:/);
  const updated = await runCli(["init", "--agents", root]);
  assert.equal(updated.code, 0, updated.stderr);
  assert.match(updated.stdout, /^Updated the Evergreen section in AGENTS\.md\./);

  const hooks = await runCli(["init", "--hooks", "--fail-on", "medium", root]);
  assert.equal(hooks.code, 0, hooks.stderr);
  assert.match(hooks.stdout, /^Created \.git\/hooks\/pre-push; it blocks a push at medium or above\./);
  assert.match(hooks.stdout, /Bypass it once with `git push --no-verify`/);
  const hooksAgain = await runCli(["init", "--hooks", "--fail-on", "medium", root]);
  assert.equal(hooksAgain.code, 0, hooksAgain.stderr);
  assert.match(hooksAgain.stdout, /^\.git\/hooks\/pre-push already has the current Evergreen hook/);
  const hooksPreview = await runCli(["init", "--hooks", "--dry-run", root]);
  assert.equal(hooksPreview.code, 0, hooksPreview.stderr);
  assert.match(hooksPreview.stdout, /^Would update \.git\/hooks\/pre-push:/);

  const managed = await nodeRepository();
  await gitInit(managed);
  await mkdir(join(managed, ".husky"), { recursive: true });
  await writeFile(join(managed, ".husky", "pre-commit"), "npm test\n");
  const husky = await runCli(["init", "--hooks", managed]);
  assert.equal(husky.code, 0, husky.stderr);
  assert.match(husky.stdout, /^husky manages the Git hooks here, so Evergreen did not write one\./);
  assert.doesNotMatch(husky.stdout, /Bypass it once/);

  const claude = await runCli(["init", "--hooks-for", "claude-code", "--dry-run", root]);
  assert.equal(claude.code, 0, claude.stderr);
  assert.match(claude.stdout, /^Would (?:create|update) \.claude\/settings\.json:/);
  const codex = await runCli(["init", "--hooks-for", "codex", root]);
  assert.equal(codex.code, 0, codex.stderr);
  assert.match(codex.stdout, /^Created \.codex\/hooks\.json; Codex now runs Evergreen after apply_patch\./);
  const codexAgain = await runCli(["init", "--hooks-for", "codex", root]);
  assert.equal(codexAgain.code, 0, codexAgain.stderr);
  assert.match(codexAgain.stdout, /^\.codex\/hooks\.json already has the current Evergreen post-edit hook/);
});

test("init --personal prints the global setup it made, once per state", async () => {
  const home = await repository("personal-home");
  const env = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const preview = await runCli(["init", "--personal", "--dry-run"], { env });
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stdout, /^Would write the global config and pre-push hook in /);

  const written = await runCli(["init", "--personal", "--yes", "--fail-on", "low"], { env });
  assert.equal(written.code, 0, written.stderr);
  assert.match(written.stdout, /every repository now blocks a push at low or above/);

  const again = await runCli(["init", "--personal", "--yes", "--fail-on", "low"], { env });
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /already current; nothing to change\./);

  const refused = await runCli(["init", "--personal"], { env });
  assert.equal(refused.code, 4, refused.stderr);
  assert.match(refused.stderr, /Confirmation needs a terminal/);
});

/** Escapes a filesystem path for use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
