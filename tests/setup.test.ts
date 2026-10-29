import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { SECTION_BEGIN } from "../src/agent-instructions.js";
import {
  applySetup,
  installSetupSkills,
  planSetup,
  skillInstallCommand,
  type SkillInstallRunner,
} from "../src/setup.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const repository = async (files: Record<string, string> = {}) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-setup-"));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

const cli = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [resolve("dist/src/cli.js"), "setup", root, ...args], {
    encoding: "utf8",
    stdin: "ignore",
    // Stub the Skill installer so these tests never use the network.
    env: { ...process.env, EVERGREEN_SETUP_SKILL_INSTALL: "0" },
  } as never);

test("a repository with no host configuration has nothing to set up", async () => {
  const root = await repository({ "README.md": "hi\n" });
  const plan = await planSetup(root);
  assert.deepEqual(plan, { detected: [], entries: [], skills: [] });
});

test("every detected host gets its own instruction file and shared files are planned once", async () => {
  const root = await repository({
    ".claude/settings.json": "{}",
    ".codex/config.toml": "",
    ".cursor/mcp.json": "{}",
    ".gemini/settings.json": "{}",
    ".github/copilot-instructions.md": "# Copilot rules\n",
    ".kilocode/mcp.json": "{}",
  });
  const plan = await planSetup(root);
  assert.deepEqual(plan.detected, ["Claude Code", "Codex", "Cursor", "Gemini CLI", "GitHub Copilot", "Kilo Code"]);
  assert.deepEqual(
    plan.entries.map((entry) => [entry.file, entry.change]),
    [
      ["CLAUDE.md", "created"],
      ["AGENTS.md", "created"],
      [".cursor/rules/evergreen.mdc", "created"],
      ["GEMINI.md", "created"],
      [".github/copilot-instructions.md", "added"],
      [".kilocode/rules/evergreen.md", "created"],
    ],
  );
  assert.deepEqual(
    plan.skills.map((offer) => [offer.host, offer.agent]),
    [
      ["Claude Code", "claude-code"],
      ["Codex", "codex"],
      ["Cursor", "cursor"],
      ["Gemini CLI", "gemini-cli"],
      ["GitHub Copilot", "github-copilot"],
    ],
  );
  assert.ok(plan.skills.every((offer) => offer.command === skillInstallCommand(offer.agent)));
  assert.equal(
    plan.skills.find((offer) => offer.host === "Cursor")?.command,
    "npx skills add arminazimi/evergreen --agent cursor --skill evergreen-deprecation --yes",
  );
  // Kilo Code has no portable Skill target.
  assert.ok(!plan.skills.some((offer) => offer.host === "Kilo Code"));
  // Planning writes nothing.
  await assert.rejects(readFile(join(root, "CLAUDE.md"), "utf8"));
});

test("applying keeps existing rules byte for byte and gives a new Cursor rule its front matter", async () => {
  const existing = "# Copilot rules\n\nUse tabs.\n";
  const root = await repository({ ".cursor/x": "", ".github/copilot-instructions.md": existing });
  const plan = await planSetup(root);
  await applySetup(root, plan);

  const copilot = await readFile(join(root, ".github/copilot-instructions.md"), "utf8");
  assert.ok(copilot.startsWith(existing));
  assert.ok(copilot.includes(SECTION_BEGIN));
  const mdc = await readFile(join(root, ".cursor/rules/evergreen.mdc"), "utf8");
  assert.match(mdc, /^---\ndescription: .*\nalwaysApply: true\n---\n\n<!-- evergreen:begin -->/);

  const again = await planSetup(root);
  assert.ok(again.entries.every((entry) => entry.change === "unchanged"));
  assert.equal(again.skills.length, 2);
});

test("a damaged marker in one file fails the plan before anything is written", async () => {
  const root = await repository({ ".claude/x": "", ".gemini/x": "", "GEMINI.md": `${SECTION_BEGIN}\nno end\n` });
  await assert.rejects(planSetup(root), /markers/);
  await assert.rejects(readFile(join(root, "CLAUDE.md"), "utf8"));
});

test("a link that leaves the repository is refused", async () => {
  const outside = await repository({ "AGENTS.md": "outside\n" });
  const root = await repository({ ".codex/x": "" });
  await symlink(join(outside, "AGENTS.md"), join(root, "AGENTS.md"));
  await assert.rejects(planSetup(root), /outside the repository/);
});

test("the command prints a plan with --dry-run, needs --yes without a terminal, and writes with --yes", async () => {
  const root = await repository({ ".claude/x": "" });

  const dry = cli(root, "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create CLAUDE\.md/);
  assert.match(dry.stdout, /Skill install \(supported hosts\):/);
  assert.match(dry.stdout, /Claude Code: npx skills add arminazimi\/evergreen --agent claude-code --skill evergreen-deprecation --yes/);
  assert.match(dry.stdout, /Dry run: nothing was written/);
  await assert.rejects(readFile(join(root, "CLAUDE.md"), "utf8"));

  const refused = cli(root);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /pass --yes/);
  assert.match(refused.stdout, /Skill install \(supported hosts\):/);
  await assert.rejects(readFile(join(root, "CLAUDE.md"), "utf8"));

  const applied = cli(root, "--yes");
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok((await readFile(join(root, "CLAUDE.md"), "utf8")).includes(SECTION_BEGIN));
  assert.match(applied.stdout, /Skill install \(supported hosts\):/);
  assert.match(applied.stdout, /Installed the Skill for Claude Code/);

  const rerun = cli(root, "--yes");
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.match(rerun.stdout, /Instruction files are already current/);
  assert.match(rerun.stdout, /Installed the Skill for Claude Code/);
});

test("hosts without Skill support get no Skill offer", async () => {
  const root = await repository({ ".kilocode/mcp.json": "{}" });
  const plan = await planSetup(root);
  assert.deepEqual(plan.detected, ["Kilo Code"]);
  assert.deepEqual(plan.skills, []);

  const dry = cli(root, "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.doesNotMatch(dry.stdout, /Skill install/);
});

test("installSetupSkills runs the exact command only when called, and dry-run never calls it", async () => {
  const root = await repository({ ".cursor/x": "" });
  const plan = await planSetup(root);
  assert.equal(plan.skills.length, 1);

  const calls: string[][] = [];
  const run: SkillInstallRunner = (args, options) => {
    calls.push([...args]);
    assert.equal(options.cwd, resolve(root));
    return { status: 0, stdout: "ok\n", stderr: "" };
  };

  const dry = cli(root, "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run: nothing was written/);
  assert.equal(calls.length, 0, "dry-run must not install Skills (no network)");

  const result = installSetupSkills(plan, { cwd: root, run });
  assert.deepEqual(result, { installed: ["Cursor"], failed: [] });
  assert.deepEqual(calls, [
    ["skills", "add", "arminazimi/evergreen", "--agent", "cursor", "--skill", "evergreen-deprecation", "--yes"],
  ]);
});

test("installSetupSkills records a failed host without throwing", async () => {
  const root = await repository({ ".gemini/x": "" });
  const plan = await planSetup(root);
  const result = installSetupSkills(plan, {
    cwd: root,
    run: () => ({ status: 1, stdout: "", stderr: "network unavailable\n" }),
  });
  assert.deepEqual(result.installed, []);
  assert.deepEqual(result.failed, [{ host: "Gemini CLI", detail: "network unavailable" }]);
});
