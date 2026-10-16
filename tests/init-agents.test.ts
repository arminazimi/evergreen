import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { AGENT_SECTION, AgentFileError, DEPENDENCY_CHECK_INSTRUCTIONS, renderDiff, SECTION_BEGIN, SECTION_END, withAgentSection } from "../src/agent-instructions.js";
import { initAgents } from "../src/init-agents.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const repository = async (files: Record<string, string> = {}) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-init-"));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents);
  return root;
};

test("the section carries the same instructions as the hand-configured examples", async () => {
  const example = await readFile(resolve("examples/agents/dependency-check.md"), "utf8");
  assert.equal(example, `# Evergreen dependency check\n\n${DEPENDENCY_CHECK_INSTRUCTIONS}`);
  assert.ok(AGENT_SECTION.startsWith(SECTION_BEGIN) && AGENT_SECTION.endsWith(SECTION_END));
  assert.match(AGENT_SECTION, /## Evergreen dependency check/);
  assert.match(AGENT_SECTION, /check_dependency/);
});

test("a new or empty file gets just the section", () => {
  assert.deepEqual(withAgentSection(undefined), { text: `${AGENT_SECTION}\n`, change: "created" });
  assert.deepEqual(withAgentSection(""), { text: `${AGENT_SECTION}\n`, change: "created" });
});

test("the section is appended after existing content, which is kept byte for byte", () => {
  const existing = "# Project rules\n\nUse tabs.\n";
  const result = withAgentSection(existing);
  assert.equal(result.change, "added");
  assert.ok(result.text.startsWith(existing), "existing content is untouched");
  assert.equal(result.text, `${existing}\n${AGENT_SECTION}\n`);
  const noFinalNewline = withAgentSection("# Rules\nNo newline at the end");
  assert.equal(noFinalNewline.text, `# Rules\nNo newline at the end\n\n${AGENT_SECTION}\n`);
});

test("running it again changes nothing", () => {
  for (const existing of ["# Rules\n", "# Rules", "Intro\n\nMore\n\n", "- a\r\n- b\r\n"]) {
    const once = withAgentSection(existing);
    const twice = withAgentSection(once.text);
    assert.equal(twice.change, "unchanged", JSON.stringify(existing));
    assert.equal(twice.text, once.text);
    assert.equal(withAgentSection(twice.text).text, once.text);
  }
});

test("an out-of-date section is replaced in place and nothing around it moves", () => {
  const before = "# Rules\n\nKeep this.\n\n";
  const after = "\n## Later notes\n\nAnd this.\n";
  const stale = `${before}${SECTION_BEGIN}\nold instructions\n${SECTION_END}${after}`;
  const result = withAgentSection(stale);
  assert.equal(result.change, "updated");
  assert.equal(result.text, `${before}${AGENT_SECTION}${after}`);
  assert.equal(withAgentSection(result.text).change, "unchanged");
});

test("Windows line endings are kept throughout", () => {
  const result = withAgentSection("# Rules\r\n\r\nText\r\n");
  assert.equal(result.change, "added");
  assert.ok(!/(?<!\r)\n/.test(result.text), "every newline is CRLF");
  assert.equal(withAgentSection(result.text).change, "unchanged");
  const refreshed = withAgentSection(`# Rules\r\n${SECTION_BEGIN}\r\nold\r\n${SECTION_END}\r\nafter\r\n`);
  assert.ok(!/(?<!\r)\n/.test(refreshed.text));
  assert.ok(refreshed.text.endsWith("\r\nafter\r\n"));
});

test("damaged markers are refused with the file untouched, never guessed at", async () => {
  for (const [name, contents] of [
    ["only a begin marker", `# Rules\n${SECTION_BEGIN}\nhalf\n`],
    ["only an end marker", `# Rules\n${SECTION_END}\n`],
    ["two sections", `${AGENT_SECTION}\n\n${AGENT_SECTION}\n`],
    ["end before begin", `${SECTION_END}\n${SECTION_BEGIN}\n`],
  ] as const) {
    assert.throws(() => withAgentSection(contents), (error: unknown) => error instanceof AgentFileError && /Nothing was changed/.test(error.message), name);
    const root = await repository({ "AGENTS.md": contents });
    await assert.rejects(initAgents({ root }), AgentFileError, name);
    assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), contents, `${name}: file untouched`);
  }
});

test("the file is chosen sensibly and created when there is none", async () => {
  const empty = await repository();
  const created = await initAgents({ root: empty });
  assert.deepEqual([created.file, created.change, created.written], ["AGENTS.md", "created", true]);
  assert.equal(await readFile(join(empty, "AGENTS.md"), "utf8"), `${AGENT_SECTION}\n`);

  const claudeOnly = await repository({ "CLAUDE.md": "# Claude notes\n" });
  assert.deepEqual((await initAgents({ root: claudeOnly })).file, "CLAUDE.md");
  assert.match(await readFile(join(claudeOnly, "CLAUDE.md"), "utf8"), /^# Claude notes\n\n<!-- evergreen:begin -->/);

  const both = await repository({ "AGENTS.md": "# Agents\n", "CLAUDE.md": "Read AGENTS.md.\n" });
  assert.equal((await initAgents({ root: both })).file, "AGENTS.md");
  assert.equal(await readFile(join(both, "CLAUDE.md"), "utf8"), "Read AGENTS.md.\n", "the other file is not touched");

  const explicit = await repository({ "AGENTS.md": "# Agents\n" });
  assert.deepEqual((await initAgents({ root: explicit, file: "CLAUDE.md" })).change, "created");
  assert.equal(await readFile(join(explicit, "AGENTS.md"), "utf8"), "# Agents\n");
});

test("--dry-run shows the diff and writes nothing", async () => {
  const root = await repository({ "AGENTS.md": "# Rules\n\nKeep.\n" });
  const dry = await initAgents({ root, dryRun: true });
  assert.deepEqual([dry.change, dry.written], ["added", false]);
  assert.match(dry.diff, /^--- a\/AGENTS\.md\n\+\+\+ b\/AGENTS\.md\n@@ /);
  assert.match(dry.diff, /\+<!-- evergreen:begin -->/);
  assert.match(dry.diff, / Keep\./, "context lines are shown");
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), "# Rules\n\nKeep.\n");

  const real = await initAgents({ root });
  assert.equal(real.written, true);
  assert.equal(real.diff, dry.diff, "the dry run shows exactly what the real run does");
  const again = await initAgents({ root, dryRun: true });
  assert.deepEqual([again.change, again.diff], ["unchanged", ""]);
});

test("the diff of a refresh shows the old section removed and the new one added", () => {
  const stale = `Top\n${SECTION_BEGIN}\nold\n${SECTION_END}\nBottom\n`;
  const diff = renderDiff("AGENTS.md", stale, withAgentSection(stale).text);
  assert.match(diff, /^-old$/m);
  assert.match(diff, /^\+## Evergreen dependency check$/m);
  assert.match(diff, /^ Top$/m);
  assert.match(diff, /^ Bottom$/m);
});

test("a link that points outside the repository is never written through", async (context) => {
  const outside = await repository({ "target.md": "private\n" });
  const root = await repository();
  try {
    await symlink(join(outside, "target.md"), join(root, "AGENTS.md"));
  } catch (error) {
    // Creating links needs a privilege on some Windows setups; there is nothing to test without one.
    if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip("this system does not allow creating symbolic links");
    throw error;
  }
  await assert.rejects(initAgents({ root }), /link to a file outside the repository/);
  assert.equal(await readFile(join(outside, "target.md"), "utf8"), "private\n");

  const inner = await repository({ "real.md": "# inside\n" });
  await symlink(join(inner, "real.md"), join(inner, "AGENTS.md"));
  assert.equal((await initAgents({ root: inner })).change, "added", "a link that stays inside is fine");
});

test("the path must be a directory", async () => {
  const root = await repository({ "file.txt": "x" });
  await assert.rejects(initAgents({ root: join(root, "file.txt") }), /is not a directory/);
  await assert.rejects(initAgents({ root: join(root, "missing") }), /is not a directory/);
  await mkdir(join(root, "sub"));
  assert.equal((await initAgents({ root: join(root, "sub") })).file, "AGENTS.md");
});

test("the command line reports each outcome with the right exit code", async () => {
  const cli = resolve("dist/src/cli.js");
  const run = (args: string[]) => execute(process.execPath, [cli, ...args]).then((value) => ({ code: 0, ...value }), (error: { code: number; stdout: string; stderr: string }) => error);
  const root = await repository({ "AGENTS.md": "# Rules\n" });

  const dry = await run(["init", "--agents", root, "--dry-run"]);
  assert.equal(dry.code, 0);
  assert.match(dry.stdout, /^Would add the Evergreen section to AGENTS\.md:\n\n--- a\/AGENTS\.md/);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), "# Rules\n");

  assert.match((await run(["init", "--agents", root])).stdout, /^Added the Evergreen section to AGENTS\.md\.\n$/);
  assert.match((await run(["init", "--agents", root])).stdout, /already has the current Evergreen section; nothing to change/);

  const stale = await repository({ "AGENTS.md": `${SECTION_BEGIN}\nold\n${SECTION_END}\n` });
  assert.match((await run(["init", "--agents", stale])).stdout, /^Updated the Evergreen section in AGENTS\.md\.\n$/);
  assert.match((await run(["init", "--agents", await repository()])).stdout, /^Created AGENTS\.md\.\n$/);

  const broken = await repository({ "AGENTS.md": `${SECTION_BEGIN}\n` });
  const refused = await run(["init", "--agents", broken]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /Nothing was changed/);

  for (const args of [["init"], ["init", root], ["init", "--agents", "--file", "README.md"], ["init", "--agents", "--bogus"], ["init", "--agents", root, root]]) {
    const usage = await run(args);
    assert.equal(usage.code, 2, args.join(" "));
    assert.match(usage.stderr, /Usage: evergreen init --agents|--file must be/);
  }
});
