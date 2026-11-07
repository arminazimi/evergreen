import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import {
  MAX_FEEDBACK_LINES,
  claudeCodeAdapter,
  claudeCodeFeedback,
  parseClaudeCodePayload,
} from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import {
  CLAUDE_CODE_HOOK_COMMAND,
  CLAUDE_CODE_HOOK_MATCHER,
  CLAUDE_CODE_SETTINGS_FILE,
  initClaudeHooks,
  withClaudeCodePostToolUse,
} from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/claude-code", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-claude-code-"));
  tempRoots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
}

const finding = (id: string, overrides: Partial<Finding> = {}): Finding => ({
  id,
  ruleId: id.split(":")[0]!,
  detector: "container",
  title: `Rule ${id}`,
  summary: "",
  severity: "high",
  confidence: "exact",
  location: { path: "Dockerfile", line: 1 },
  replacement: "node:22",
  sources: [{ title: "Node.js end-of-life releases", url: "https://nodejs.org/en/about/eol" }],
  ...overrides,
});

test("each write tool parses to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  for (const name of ["write.json", "edit.json", "multiedit.json"]) {
    assert.deepEqual(parseClaudeCodePayload(await payload(name), {}), { root, files: ["Dockerfile"] }, name);
  }
});

test("other tools and payloads without a file are not edit events", async () => {
  assert.equal(parseClaudeCodePayload(await payload("bash.json"), {}), undefined);
  assert.equal(
    parseClaudeCodePayload(
      { tool_name: "Read", tool_input: { file_path: "/Users/dev/app/a.ts" }, cwd: "/Users/dev/app" },
      {},
    ),
    undefined,
  );
  assert.equal(parseClaudeCodePayload({ tool_name: "Write", tool_input: {}, cwd: "/Users/dev/app" }, {}), undefined);
  assert.equal(
    parseClaudeCodePayload({ tool_name: "Write", tool_input: { file_path: "/Users/dev/app/a.ts" } }, {}),
    undefined,
  );
  assert.equal(parseClaudeCodePayload("not an object", {}), undefined);
});

test("CLAUDE_PROJECT_DIR supplies the root when the payload has no cwd", () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(
    parseClaudeCodePayload(
      { tool_name: "Write", tool_input: { file_path: "packages/app/Dockerfile" } },
      { CLAUDE_PROJECT_DIR: "/Users/dev/app" },
    ),
    { root, files: ["packages/app/Dockerfile"] },
  );
});

test("a path outside the repository root is not an edit to report", () => {
  assert.equal(
    parseClaudeCodePayload(
      { tool_name: "Write", tool_input: { file_path: "/tmp/elsewhere/Dockerfile" }, cwd: "/Users/dev/app" },
      {},
    ),
    undefined,
  );
});

test("findings become exit-2 stderr feedback naming the rule, location, replacement, and evidence", () => {
  const response = claudeCodeAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 2);
  assert.equal(response.stdout, "");
  assert.match(response.stderr, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(response.stderr, /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/);
  assert.match(response.stderr, /Replacement: node:22/);
  assert.match(response.stderr, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success", () => {
  assert.deepEqual(claudeCodeAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
});

test("a finding without a line names the file alone, with no trailing colon", () => {
  const bare = { ...finding("rule.bare:Dockerfile"), location: { path: "Dockerfile" } };
  const response = claudeCodeFeedback([bare]);
  assert.match(response.stderr, /\[high\] Rule rule\.bare:Dockerfile — Dockerfile\n/);
});

test("feedback stays within the line cap, says how many more, and omits a missing replacement", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = claudeCodeFeedback(many);
  const lines = response.stderr.trimEnd().split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(response.stderr, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!response.stderr.includes("Replacement:"));
});

test("the settings merge keeps the install guard and user hooks, then appends the post-edit entry", async () => {
  const before = JSON.parse(await fixture("settings-with-guard.json")) as Record<string, unknown>;
  const { settings, change } = withClaudeCodePostToolUse(before);
  assert.equal(change, "added");
  assert.deepEqual(settings.permissions, { allow: ["Bash(npm test)"] });
  const hooks = settings.hooks as Record<string, unknown[]>;
  assert.equal(hooks.PreToolUse!.length, 1, "the pre-install guard is untouched");
  assert.match(JSON.stringify(hooks.PreToolUse), /pre-install-guard\.mjs/);
  assert.equal(hooks.PostToolUse!.length, 2, "the user hook stays first");
  const entry = hooks.PostToolUse![1] as { matcher: string; hooks: Array<{ command: string }> };
  assert.equal(entry.matcher, CLAUDE_CODE_HOOK_MATCHER);
  assert.equal(entry.hooks[0]!.command, CLAUDE_CODE_HOOK_COMMAND);
  assert.deepEqual((before.hooks as Record<string, unknown[]>).PostToolUse!.length, 1, "the input is not mutated");
});

test("a new settings file is created, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initClaudeHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [CLAUDE_CODE_SETTINGS_FILE, "created", true]);
  const written = JSON.parse(await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8")) as {
    hooks: Record<string, Array<{ matcher: string }>>;
  };
  assert.equal(written.hooks.PostToolUse!.length, 1);
  assert.equal(written.hooks.PostToolUse![0]!.matcher, CLAUDE_CODE_HOOK_MATCHER);

  const again = await initClaudeHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into an existing settings file keeps every existing entry", async () => {
  const root = await repository({ [CLAUDE_CODE_SETTINGS_FILE]: await fixture("settings-with-guard.json") });
  const result = await initClaudeHooks({ root });
  assert.equal(result.change, "updated");
  const written = JSON.parse(await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8")) as {
    hooks: Record<string, unknown[]>;
  };
  assert.equal(written.hooks.PreToolUse!.length, 1);
  assert.equal(written.hooks.PostToolUse!.length, 2);
  assert.match(result.diff, /^--- a\/\.claude\/settings\.json\n\+\+\+ b\/\.claude\/settings\.json/);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [CLAUDE_CODE_SETTINGS_FILE]: await fixture("settings-with-guard.json") });
  const before = await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8");
  const result = await initClaudeHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["updated", false]);
  assert.match(result.diff, /\+.*hook claude-code/);
  assert.equal(await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8"), before);
});

test("invalid JSON or an unexpected hooks shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"hooks": []}', '{"hooks": {"PostToolUse": {}}}']) {
    const root = await repository({ [CLAUDE_CODE_SETTINGS_FILE]: contents });
    await assert.rejects(initClaudeHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "claude-code", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.claude\/settings\.json:/);
  await assert.rejects(readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "claude-code", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(written.stdout, /Claude Code now runs Evergreen after Write, Edit, and MultiEdit/);
  assert.match(
    await readFile(join(root, CLAUDE_CODE_SETTINGS_FILE), "utf8"),
    /npx --no-install evergreen-deprecation hook claude-code/,
  );

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: claude-code, codex, cursor, gemini, copilot, or cline/);
});

test("end to end: writing FROM node:16 gets the rule and replacement back on stderr with exit 2", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const write: Record<string, unknown> = { ...((await payload("write.json")) as Record<string, unknown>), cwd: root };
  write["tool_input"] = { file_path: join(root, "Dockerfile"), content: "FROM node:16\n" };

  const flagged = spawnSync(process.execPath, [cli, "hook", "claude-code"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(write),
  });
  assert.equal(flagged.status, 2, flagged.stderr);
  assert.equal(flagged.stdout, "");
  assert.match(flagged.stderr, /Node\.js image release lines 21 and older are end-of-life/);
  assert.match(flagged.stderr, /Dockerfile:1/);
  assert.match(flagged.stderr, /Replacement: A node image on a supported release line, such as node:22/);
  assert.match(flagged.stderr, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  const clean: Record<string, unknown> = { ...((await payload("edit.json")) as Record<string, unknown>), cwd: root };
  clean["tool_input"] = {
    file_path: join(root, "README.md"),
    old_string: "# App",
    new_string: "# App",
    replace_all: false,
  };
  const silent = spawnSync(process.execPath, [cli, "hook", "claude-code"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(clean),
  });
  assert.equal(silent.status, 0, silent.stderr);
  assert.deepEqual([silent.stdout, silent.stderr], ["", ""]);
  assert.equal(
    await readFile(join(root, "Dockerfile"), "utf8"),
    'FROM node:16\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]\n',
    "the hook never edits files",
  );
});
