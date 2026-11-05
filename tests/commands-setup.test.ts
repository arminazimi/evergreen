import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { command } from "../src/commands/setup.js";
import { EXIT_CODES, createCommandContext } from "../src/commands/runtime.js";
import type { CommandContext, FailureClass } from "../src/commands/types.js";
import { SECTION_BEGIN, SECTION_END } from "../src/agent-instructions.js";
import { renderActionable } from "../src/errors.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A repository; the keys are paths, so a marker file such as `.claude/x` stands for a detected host. */
async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(os.tmpdir(), "evergreen-setup-command-"));
  temporaryRoots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
}

const USAGE = "Usage: evergreen setup [path] [--yes] [--dry-run]";

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly failures: Array<{ kind: FailureClass; message: string }>;
}

/** Runs the shipping `setup` handler in this process, with the Skill installer stubbed so nothing reaches the network. */
async function setup(...args: string[]): Promise<Run> {
  const failures: Run["failures"] = [];
  const base = createCommandContext(["setup", ...args], "help");
  const ctx: CommandContext = {
    ...base,
    fail(kind, message) {
      failures.push({ kind, message });
      return EXIT_CODES[kind];
    },
    failActionable(kind, actionable) {
      const rendered = renderActionable(actionable);
      return ctx.fail(kind, rendered.message, rendered.appendix);
    },
  };
  const original = { stdout: process.stdout.write, install: process.env.EVERGREEN_SETUP_SKILL_INSTALL };
  let stdout = "";
  const collect = (chunk: unknown): boolean => {
    if (typeof chunk === "string") stdout += chunk;
    return true;
  };
  process.stdout.write = collect as typeof process.stdout.write;
  process.env.EVERGREEN_SETUP_SKILL_INSTALL = "0";
  try {
    const code = await command.run(args, ctx);
    return { code, stdout, failures };
  } finally {
    process.stdout.write = original.stdout;
    if (original.install === undefined) delete process.env.EVERGREEN_SETUP_SKILL_INSTALL;
    else process.env.EVERGREEN_SETUP_SKILL_INSTALL = original.install;
  }
}

test("setup rejects a flag it does not know and a second path", async () => {
  const root = await repository({ ".claude/x": "" });
  for (const args of [
    [root, "--force"],
    [root, root],
    ["--yes", root, root],
  ]) {
    const run = await setup(...args);
    assert.equal(run.code, 2, args.join(" "));
    assert.deepEqual(run.failures, [{ kind: "usage", message: USAGE }], args.join(" "));
    assert.equal(run.stdout, "");
  }
});

test("setup says what it looked for when no host configuration exists", async () => {
  const root = await repository({ "README.md": "hi\n" });
  const run = await setup(root);
  assert.equal(run.code, 0, run.failures[0]?.message);
  assert.match(run.stdout, /^No agent host configuration found \(looked for Claude Code, Codex,/);
  assert.match(run.stdout, /Run `evergreen init --agents` to add the section to AGENTS\.md or CLAUDE\.md\.\n$/);
});

test("setup prints the plan it would apply and writes nothing on a dry run", async () => {
  const root = await repository({ ".claude/x": "" });
  const run = await setup(root, "--dry-run");
  assert.equal(run.code, 0, run.failures[0]?.message);
  assert.match(run.stdout, /^Detected: Claude Code\n\nWould create CLAUDE\.md \(Claude Code\)\n/);
  // The plan carries the diff of the file it would write.
  assert.match(run.stdout, /^--- a\/CLAUDE\.md\n\+\+\+ b\/CLAUDE\.md\n@@ /m);
  assert.match(run.stdout, /\+## Evergreen dependency check/);
  assert.match(
    run.stdout,
    /\nSkill install \(supported hosts\):\n  Claude Code: npx skills add arminazimi\/evergreen --agent claude-code --skill evergreen-deprecation --yes\nDry run: nothing was written\.\n$/,
  );
  await assert.rejects(readFile(join(root, "CLAUDE.md"), "utf8"));
});

test("setup names the verb of every change, including one that is already current", async () => {
  const root = await repository({ ".codex/x": "" });
  const created = await setup(root, "--yes");
  assert.equal(created.code, 0, created.failures[0]?.message);
  assert.match(created.stdout, /Would create AGENTS\.md \(Codex\)/);
  assert.match(created.stdout, /^Updated AGENTS\.md\.\n/m);
  assert.match(created.stdout, /Installed the Skill for Codex\.\n/);

  // The same file with an outdated section is an update, and the plan prints its diff.
  const current = await readFile(join(root, "AGENTS.md"), "utf8");
  await writeFile(
    join(root, "AGENTS.md"),
    current.replace(new RegExp(`(${SECTION_BEGIN})[\\s\\S]*?(${SECTION_END})`), "$1\nAn older section.\n$2"),
  );
  const updated = await setup(root, "--dry-run");
  assert.equal(updated.code, 0, updated.failures[0]?.message);
  assert.match(updated.stdout, /Would update the Evergreen section in AGENTS\.md \(Codex\)/);
  assert.match(updated.stdout, /An older section\./);

  // Nothing to change and no Skill to offer is the one case that says so plainly.
  const kilo = await repository({ ".kilocode/mcp.json": "{}" });
  await setup(kilo, "--yes");
  const unchanged = await setup(kilo, "--yes");
  assert.equal(unchanged.code, 0, unchanged.failures[0]?.message);
  assert.match(unchanged.stdout, /Already current: \.kilocode\/rules\/evergreen\.md \(Kilo Code\)/);
  assert.match(unchanged.stdout, /^Nothing to change\.\n/m);
});

test("setup without --yes refuses to write when there is no terminal to ask in", async () => {
  const root = await repository({ ".cursor/x": "" });
  const run = await setup(root);
  assert.equal(run.code, 2);
  assert.deepEqual(run.failures, [
    {
      kind: "usage",
      message: "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.",
    },
  ]);
  assert.match(run.stdout, /Would create \.cursor\/rules\/evergreen\.mdc \(Cursor\)/);
  // The refusal returns before anything is written or offered, so the plan is the last word.
  assert.doesNotMatch(run.stdout, /Nothing was written\.|Updated |Pass --yes to install/);
  assert.match(
    run.stdout,
    /\nSkill install \(supported hosts\):\n  Cursor: npx skills add arminazimi\/evergreen --agent cursor --skill evergreen-deprecation --yes\n$/,
  );
  await assert.rejects(readFile(join(root, ".cursor", "rules", "evergreen.mdc"), "utf8"));
});

test("setup says the files are current when only the Skill is left to offer", async () => {
  const root = await repository({ ".claude/x": "" });
  await setup(root, "--yes");
  const run = await setup(root, "--dry-run");
  assert.equal(run.code, 0, run.failures[0]?.message);
  assert.match(run.stdout, /Already current: CLAUDE\.md \(Claude Code\)/);
  assert.match(run.stdout, /Dry run: nothing was written\.\n$/);

  // Files current with a Skill still to offer is the other ending: nothing is written, the command is only shown.
  const offered = await setup(root);
  assert.equal(offered.code, 0, offered.failures[0]?.message);
  assert.match(offered.stdout, /^Instruction files are already current\.\n/m);
  assert.match(offered.stdout, /Pass --yes to install the Skill, or run the command above\.\n$/);
});

test("a damaged instruction file is a parse failure, and so is a path that is not a directory", async () => {
  const damaged = await repository({ ".claude/x": "", "CLAUDE.md": `${SECTION_BEGIN}\nno end marker\n` });
  const broken = await setup(damaged);
  assert.equal(broken.code, 4);
  assert.equal(broken.failures[0]?.kind, "parse");
  assert.match(broken.failures[0]?.message ?? "", /markers/);

  const file = join(await repository(), "not-a-directory");
  await writeFile(file, "x\n");
  const missing = await setup(file);
  assert.equal(missing.code, 4);
  assert.equal(missing.failures[0]?.kind, "parse");
  assert.match(missing.failures[0]?.message ?? "", /is not a directory/);
});
