import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import {
  copilotAdapter,
  copilotFeedbackText,
  copilotResponse,
  parseCopilotPayload,
} from "../src/agent-hooks/copilot.js";
import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import {
  COPILOT_HOOK_COMMAND,
  COPILOT_HOOK_MATCHER,
  COPILOT_HOOK_TIMEOUT_SEC,
  COPILOT_HOOKS_FILE,
  initCopilotHooks,
  withCopilotPostToolUse,
} from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/copilot", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-copilot-"));
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

test("edit and create payloads parse to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseCopilotPayload(await payload("post-tool-use.json")), {
    root,
    files: ["Dockerfile"],
  });
  assert.deepEqual(parseCopilotPayload(await payload("create-file.json")), {
    root,
    files: ["packages/app/Dockerfile"],
  });
});

test("the VS Code compatible PostToolUse payload parses the Claude tool names", async () => {
  assert.deepEqual(parseCopilotPayload(await payload("post-tool-use-vscode.json")), {
    root: resolve("/Users/dev/app"),
    files: ["Dockerfile"],
  });
});

test("other events, other tools, and paths outside the repository are not edit events", async () => {
  assert.equal(parseCopilotPayload(await payload("run-shell.json")), undefined);
  assert.equal(
    parseCopilotPayload({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "Dockerfile" },
      cwd: "/Users/dev/app",
    }),
    undefined,
  );
  assert.equal(
    parseCopilotPayload({ toolName: "edit", toolArgs: { path: "/elsewhere/Dockerfile" }, cwd: "/Users/dev/app" }),
    undefined,
  );
  assert.equal(parseCopilotPayload({ toolName: "edit", toolArgs: "not json", cwd: "/Users/dev/app" }), undefined);
  assert.equal(parseCopilotPayload({ toolName: "edit", toolArgs: { path: "Dockerfile" } }), undefined);
  assert.equal(parseCopilotPayload("not an object"), undefined);
});

test("findings come back as postToolUse additionalContext on stdout with exit 0", () => {
  const response = copilotAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "");
  assert.ok(!response.stdout.trimEnd().includes("\n"), "Copilot documents a single-line JSON output");
  const document = JSON.parse(response.stdout) as { additionalContext: string };
  assert.match(document.additionalContext, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(
    document.additionalContext,
    /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/,
  );
  assert.match(document.additionalContext, /Replacement: node:22/);
  assert.match(document.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success, and the feedback text is empty", () => {
  assert.deepEqual(copilotAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(copilotFeedbackText([]), "");
});

test("the feedback text stays within the line cap and says how many more", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = copilotResponse(many);
  const context = (JSON.parse(response.stdout) as { additionalContext: string }).additionalContext;
  const lines = context.split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(context, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!context.includes("Replacement:"));
});

test("the hooks merge keeps existing hooks and appends one postToolUse entry", async () => {
  const before = JSON.parse(await fixture("hooks-with-existing.json")) as Record<string, unknown>;
  const { document, change } = withCopilotPostToolUse(before);
  assert.equal(change, "added");
  assert.equal(document.version, 1);
  const hooks = document.hooks as Record<string, unknown[]>;
  assert.equal(hooks.sessionStart!.length, 1, "the user's sessionStart hook is untouched");
  assert.equal(hooks.postToolUse!.length, 2, "the user's postToolUse hook stays first");
  const entry = hooks.postToolUse![1] as Record<string, unknown>;
  assert.deepEqual(entry, {
    type: "command",
    matcher: COPILOT_HOOK_MATCHER,
    command: COPILOT_HOOK_COMMAND,
    timeoutSec: COPILOT_HOOK_TIMEOUT_SEC,
  });
  assert.equal(COPILOT_HOOK_MATCHER, "create|edit");
  assert.equal(COPILOT_HOOK_TIMEOUT_SEC, 60, "Copilot timeouts are seconds");
  assert.equal((before.hooks as Record<string, unknown[]>).postToolUse!.length, 1, "the input is not mutated");
});

test("a new hooks file is created, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initCopilotHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [COPILOT_HOOKS_FILE, "created", true]);
  const written = JSON.parse(await readFile(join(root, COPILOT_HOOKS_FILE), "utf8")) as {
    version: number;
    hooks: Record<string, Array<Record<string, unknown>>>;
  };
  assert.equal(written.version, 1);
  assert.equal(written.hooks.postToolUse!.length, 1);
  assert.equal(written.hooks.postToolUse![0]!.command, COPILOT_HOOK_COMMAND);

  const again = await initCopilotHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, COPILOT_HOOKS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into an existing file keeps every entry, prints a diff, and leaves the instructions alone", async () => {
  const instructions = "# Project instructions\n\nUse Evergreen.\n";
  const root = await repository({
    [COPILOT_HOOKS_FILE]: await fixture("hooks-with-existing.json"),
    ".github/copilot-instructions.md": instructions,
  });
  const result = await initCopilotHooks({ root });
  assert.equal(result.change, "updated");
  const written = JSON.parse(await readFile(join(root, COPILOT_HOOKS_FILE), "utf8")) as {
    hooks: Record<string, unknown[]>;
  };
  assert.equal(written.hooks.sessionStart!.length, 1);
  assert.equal(written.hooks.postToolUse!.length, 2);
  assert.match(result.diff, /^--- a\/\.github\/hooks\/evergreen\.json\n\+\+\+ b\/\.github\/hooks\/evergreen\.json/);
  assert.equal(await readFile(join(root, ".github/copilot-instructions.md"), "utf8"), instructions);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [COPILOT_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const before = await readFile(join(root, COPILOT_HOOKS_FILE), "utf8");
  const result = await initCopilotHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["updated", false]);
  assert.match(result.diff, /\+.*hook copilot/);
  assert.equal(await readFile(join(root, COPILOT_HOOKS_FILE), "utf8"), before);
});

test("invalid JSON or an unexpected shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"version": 2}', '{"hooks": []}', '{"hooks": {"postToolUse": {}}}']) {
    const root = await repository({ [COPILOT_HOOKS_FILE]: contents });
    await assert.rejects(initCopilotHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, COPILOT_HOOKS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "copilot", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.github\/hooks\/evergreen\.json:/);
  assert.match(dry.stdout, /\+.*hook copilot/);
  await assert.rejects(readFile(join(root, COPILOT_HOOKS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "copilot", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(
    written.stdout,
    /Created \.github\/hooks\/evergreen\.json; GitHub Copilot now runs Evergreen after create and edit\./,
  );
  assert.match(
    await readFile(join(root, COPILOT_HOOKS_FILE), "utf8"),
    /npx --no-install evergreen-deprecation hook copilot/,
  );

  const again = spawnSync(process.execPath, [cli, "init", "--hooks-for", "copilot", root], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.github\/hooks\/evergreen\.json already has the current Evergreen post-edit hook/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: /);
});

test("end to end: editing FROM node:16 returns postToolUse feedback with exit 0", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const edit: Record<string, unknown> = {
    ...((await payload("post-tool-use.json")) as Record<string, unknown>),
    cwd: root,
    toolArgs: { path: join(root, "Dockerfile"), old_str: "FROM node:20", new_str: "FROM node:16" },
  };

  const flagged = spawnSync(process.execPath, [cli, "hook", "copilot"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stderr, "");
  const document = JSON.parse(flagged.stdout) as { additionalContext: string };
  assert.match(document.additionalContext, /Evergreen found 1 lifecycle issue/);
  assert.match(document.additionalContext, /Node\.js image release lines 21 and older are end-of-life/);
  assert.match(document.additionalContext, /Dockerfile:1/);
  assert.match(document.additionalContext, /Replacement: A node image on a supported release line, such as node:22/);
  assert.match(document.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "22"));
  const clean: Record<string, unknown> = {
    ...edit,
    toolArgs: { path: join(root, "Dockerfile"), old_str: "FROM node:20", new_str: "FROM node:22" },
  };
  const silent = spawnSync(process.execPath, [cli, "hook", "copilot"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(clean),
  });
  assert.equal(silent.status, 0, silent.stderr);
  assert.deepEqual([silent.stdout, silent.stderr], ["", ""]);
  assert.equal(
    await readFile(join(root, "Dockerfile"), "utf8"),
    'FROM node:22\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]\n',
    "the hook never edits files",
  );
});
