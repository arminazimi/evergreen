import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { SECTION_BEGIN } from "../src/agent-instructions.js";
import { initAgent } from "../src/init.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const repository = async (files: Record<string, string> = {}) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-init-agent-"));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

const cli = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [resolve("dist/src/cli.js"), "init", "agent", root, ...args], { encoding: "utf8" });

test("Claude Code fixture: detected from .claude and writes CLAUDE.md", async () => {
  const root = await repository({ ".claude/settings.json": "{}" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Claude Code"]);
  assert.deepEqual(result.written, ["CLAUDE.md"]);
  const content = await readFile(join(root, "CLAUDE.md"), "utf8");
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Claude Code fixture: preserves existing CLAUDE.md content", async () => {
  const existing = "# Custom Claude Rules\n\nAlways use TypeScript.\n";
  const root = await repository({ "CLAUDE.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Claude Code"]);
  assert.deepEqual(result.written, ["CLAUDE.md"]);
  const content = await readFile(join(root, "CLAUDE.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Codex fixture: detected from .codex and writes AGENTS.md", async () => {
  const root = await repository({ ".codex/config.toml": "" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Codex"]);
  assert.deepEqual(result.written, ["AGENTS.md"]);
  const content = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Codex fixture: preserves existing AGENTS.md content", async () => {
  const existing = "# Project Rules\n\nRun tests before commit.\n";
  const root = await repository({ ".codex/config.toml": "", "AGENTS.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Codex"]);
  assert.deepEqual(result.written, ["AGENTS.md"]);
  const content = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Cursor fixture: detected from .cursor and writes .cursor/rules/evergreen.mdc with front matter", async () => {
  const root = await repository({ ".cursor/settings.json": "{}" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Cursor"]);
  assert.deepEqual(result.written, [".cursor/rules/evergreen.mdc"]);
  const content = await readFile(join(root, ".cursor/rules/evergreen.mdc"), "utf8");
  assert.match(content, /^---\ndescription: .+\nalwaysApply: true\n---\n\n<!-- evergreen:begin -->/);
});

test("Cursor fixture: detected from .cursorrules and preserves existing file content", async () => {
  const existing = "---\ndescription: Custom rules\nalwaysApply: true\n---\n\n# Rules\n";
  const root = await repository({ ".cursorrules": "", ".cursor/rules/evergreen.mdc": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Cursor"]);
  assert.deepEqual(result.written, [".cursor/rules/evergreen.mdc"]);
  const content = await readFile(join(root, ".cursor/rules/evergreen.mdc"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("GitHub Copilot fixture: detected from .github/copilot-instructions.md and preserves content", async () => {
  const existing = "# Copilot Instructions\n\nBe concise.\n";
  const root = await repository({ ".github/copilot-instructions.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["GitHub Copilot"]);
  assert.deepEqual(result.written, [".github/copilot-instructions.md"]);
  const content = await readFile(join(root, ".github/copilot-instructions.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
  assert.doesNotMatch(content, /^---/);
});

test("GitHub Copilot fixture: detected from .github/instructions and creates copilot-instructions.md", async () => {
  const root = await repository({ ".github/instructions/general.md": "follow rules\n" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["GitHub Copilot"]);
  assert.deepEqual(result.written, [".github/copilot-instructions.md"]);
  const content = await readFile(join(root, ".github/copilot-instructions.md"), "utf8");
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Windsurf fixture: detected from .windsurf and writes .windsurf/rules/evergreen.md with front matter", async () => {
  const root = await repository({ ".windsurf/mcp_config.json": "{}" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Windsurf"]);
  assert.deepEqual(result.written, [".windsurf/rules/evergreen.md"]);
  const content = await readFile(join(root, ".windsurf/rules/evergreen.md"), "utf8");
  assert.match(content, /^---\ntrigger: always_on\ndescription: .+\n---\n\n<!-- evergreen:begin -->/);
});

test("Windsurf fixture: detected from .windsurfrules and preserves existing rules", async () => {
  const existing = "---\ntrigger: always_on\ndescription: Existing\n---\n\n# Existing Cascade Rules\n";
  const root = await repository({ ".windsurfrules": "", ".windsurf/rules/evergreen.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Windsurf"]);
  assert.deepEqual(result.written, [".windsurf/rules/evergreen.md"]);
  const content = await readFile(join(root, ".windsurf/rules/evergreen.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Cline fixture: detected from .cline and writes .cline/rules/evergreen.md without front matter", async () => {
  const root = await repository({ ".cline/cline_mcp_settings.json": "{}" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Cline"]);
  assert.deepEqual(result.written, [".cline/rules/evergreen.md"]);
  const content = await readFile(join(root, ".cline/rules/evergreen.md"), "utf8");
  assert.ok(content.startsWith(SECTION_BEGIN));
});

test("Cline fixture: detected from .clinerules and preserves existing rules", async () => {
  const existing = "# Custom Cline Rules\n";
  const root = await repository({ ".clinerules/general.md": "rules\n", ".clinerules/evergreen.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Cline"]);
  assert.deepEqual(result.written, [".clinerules/evergreen.md"]);
  const content = await readFile(join(root, ".clinerules/evergreen.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("Aider fixture: detected from .aider.conf.yml and writes CONVENTIONS.md", async () => {
  const root = await repository({ ".aider.conf.yml": "read: CONVENTIONS.md\n" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Aider"]);
  assert.deepEqual(result.written, ["CONVENTIONS.md"]);
  const content = await readFile(join(root, "CONVENTIONS.md"), "utf8");
  assert.ok(content.startsWith(SECTION_BEGIN));
});

test("Aider fixture: detected from .aider directory and preserves existing conventions", async () => {
  const existing = "# Conventions\n\nRun pytest.\n";
  const root = await repository({ ".aider/history": "", "CONVENTIONS.md": existing });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, ["Aider"]);
  assert.deepEqual(result.written, ["CONVENTIONS.md"]);
  const content = await readFile(join(root, "CONVENTIONS.md"), "utf8");
  assert.ok(content.startsWith(existing));
  assert.ok(content.includes(SECTION_BEGIN));
});

test("fallback creates AGENTS.md when no host is configured", async () => {
  const root = await repository({ "README.md": "# Hello\n" });
  const result = await initAgent({ root });
  assert.deepEqual(result.detected, []);
  assert.deepEqual(result.written, ["AGENTS.md"]);
  const content = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.ok(content.startsWith(SECTION_BEGIN));
});

test("fallback respects --file option", async () => {
  const root = await repository();
  const result = await initAgent({ root, file: "CLAUDE.md" });
  assert.deepEqual(result.detected, []);
  assert.deepEqual(result.written, ["CLAUDE.md"]);
  const content = await readFile(join(root, "CLAUDE.md"), "utf8");
  assert.ok(content.startsWith(SECTION_BEGIN));
  await assert.rejects(readFile(join(root, "AGENTS.md"), "utf8"));
});

test("--dry-run reports the diff and writes nothing for detected hosts", async () => {
  const root = await repository({ ".windsurf/mcp_config.json": "{}" });
  const result = await initAgent({ root, dryRun: true });
  assert.deepEqual(result.detected, ["Windsurf"]);
  assert.deepEqual(result.written, []);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]!.file, ".windsurf/rules/evergreen.md");
  assert.equal(result.entries[0]!.change, "created");
  assert.ok(result.entries[0]!.diff.includes("+<!-- evergreen:begin -->"));
  await assert.rejects(readFile(join(root, ".windsurf/rules/evergreen.md"), "utf8"));
});

test("CLI evergreen init agent detects host, writes matching file, and handles dry-run", async () => {
  const root = await repository({ ".cursor/rules/other.mdc": "" });

  // Dry run prints diff and writes nothing
  const dry = cli(root, "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Would create \.cursor\/rules\/evergreen\.mdc:\n\n--- a\/\.cursor\/rules\/evergreen\.mdc/);
  await assert.rejects(readFile(join(root, ".cursor/rules/evergreen.mdc"), "utf8"));

  // Real run writes the file
  const real = cli(root);
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /^Created \.cursor\/rules\/evergreen\.mdc\.\n$/);
  const content = await readFile(join(root, ".cursor/rules/evergreen.mdc"), "utf8");
  assert.ok(content.includes(SECTION_BEGIN));

  // Rerun is unchanged
  const rerun = cli(root);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.match(rerun.stdout, /already has the current Evergreen section; nothing to change/);
});

test("CLI evergreen init agent validates flags", async () => {
  const root = await repository();
  const badFlag = cli(root, "--bogus");
  assert.equal(badFlag.status, 2);
  assert.match(badFlag.stderr, /Usage: evergreen init agent/);

  const badFile = cli(root, "--file", "README.md");
  assert.equal(badFile.status, 2);
  assert.match(badFile.stderr, /--file must be AGENTS\.md or CLAUDE\.md/);
});
