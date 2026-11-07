import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { geminiAdapter, geminiFeedbackText, geminiResponse, parseGeminiPayload } from "../src/agent-hooks/gemini.js";
import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import {
  GEMINI_HOOK_COMMAND,
  GEMINI_HOOK_MATCHER,
  GEMINI_HOOK_TIMEOUT_MS,
  GEMINI_SETTINGS_FILE,
  initGeminiHooks,
  withGeminiAfterTool,
} from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/gemini", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-gemini-"));
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

test("write_file and replace payloads parse to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseGeminiPayload(await payload("write-file.json"), {}), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseGeminiPayload(await payload("replace.json"), {}), {
    root,
    files: ["packages/app/Dockerfile"],
  });
});

test("GEMINI_PROJECT_DIR supplies the root when the payload omits cwd", () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(
    parseGeminiPayload(
      { hook_event_name: "AfterTool", tool_name: "write_file", tool_input: { file_path: "Dockerfile" } },
      { GEMINI_PROJECT_DIR: "/Users/dev/app" },
    ),
    { root, files: ["Dockerfile"] },
  );
});

test("other events, other tools, and paths outside the project are not edit events", async () => {
  assert.equal(parseGeminiPayload(await payload("run-shell.json"), {}), undefined);
  assert.equal(
    parseGeminiPayload(
      { hook_event_name: "BeforeTool", tool_name: "write_file", tool_input: { file_path: "Dockerfile" }, cwd: "/a" },
      {},
    ),
    undefined,
  );
  assert.equal(
    parseGeminiPayload(
      {
        hook_event_name: "AfterTool",
        tool_name: "write_file",
        tool_input: { file_path: "/elsewhere/Dockerfile" },
        cwd: "/Users/dev/app",
      },
      {},
    ),
    undefined,
  );
  assert.equal(parseGeminiPayload("not an object", {}), undefined);
});

test("findings come back as AfterTool additionalContext with exit 0; stderr stays empty", () => {
  const response = geminiAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "");
  const document = JSON.parse(response.stdout) as {
    systemMessage: string;
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(document.systemMessage, "Evergreen found 1 lifecycle issue in the files just changed.");
  assert.equal(document.hookSpecificOutput.hookEventName, "AfterTool");
  assert.match(document.hookSpecificOutput.additionalContext, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(
    document.hookSpecificOutput.additionalContext,
    /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/,
  );
  assert.match(document.hookSpecificOutput.additionalContext, /Replacement: node:22/);
  assert.match(document.hookSpecificOutput.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success, and the feedback text is empty", () => {
  assert.deepEqual(geminiAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(geminiFeedbackText([]), "");
});

test("the feedback text stays within the line cap and says how many more", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = geminiResponse(many);
  const context = (JSON.parse(response.stdout) as { hookSpecificOutput: { additionalContext: string } })
    .hookSpecificOutput.additionalContext;
  const lines = context.split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(context, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!context.includes("Replacement:"));
});

test("the settings merge keeps existing settings and hooks, and appends the AfterTool entry", async () => {
  const before = JSON.parse(await fixture("settings-with-existing.json")) as Record<string, unknown>;
  const { settings, change } = withGeminiAfterTool(before);
  assert.equal(change, "added");
  assert.equal(settings.theme, "Default");
  assert.ok(settings.mcpServers !== undefined, "the MCP server entry is untouched");
  const hooks = settings.hooks as Record<string, unknown[]>;
  assert.equal(hooks.BeforeTool!.length, 1, "the user's BeforeTool hook is untouched");
  assert.equal(hooks.AfterTool!.length, 2, "the user's AfterTool hook stays first");
  const entry = hooks.AfterTool![1] as { matcher: string; hooks: Array<Record<string, unknown>> };
  assert.equal(entry.matcher, GEMINI_HOOK_MATCHER);
  assert.deepEqual(entry.hooks[0], {
    name: "evergreen",
    type: "command",
    command: GEMINI_HOOK_COMMAND,
    timeout: GEMINI_HOOK_TIMEOUT_MS,
  });
  assert.equal(GEMINI_HOOK_MATCHER, "write_file|replace");
  assert.equal(GEMINI_HOOK_TIMEOUT_MS, 60_000, "Gemini CLI timeouts are milliseconds");
  assert.equal((before.hooks as Record<string, unknown[]>).AfterTool!.length, 1, "the input is not mutated");
});

test("a new settings file is created, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initGeminiHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [GEMINI_SETTINGS_FILE, "created", true]);
  const written = JSON.parse(await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8")) as {
    hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
  };
  assert.equal(written.hooks.AfterTool!.length, 1);
  assert.equal(written.hooks.AfterTool![0]!.matcher, GEMINI_HOOK_MATCHER);
  assert.equal(written.hooks.AfterTool![0]!.hooks[0]!.command, GEMINI_HOOK_COMMAND);

  const again = await initGeminiHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into existing settings keeps every entry and prints a diff", async () => {
  const root = await repository({ [GEMINI_SETTINGS_FILE]: await fixture("settings-with-existing.json") });
  const result = await initGeminiHooks({ root });
  assert.equal(result.change, "updated");
  const written = JSON.parse(await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8")) as {
    theme: string;
    hooks: Record<string, unknown[]>;
  };
  assert.equal(written.theme, "Default");
  assert.equal(written.hooks.BeforeTool!.length, 1);
  assert.equal(written.hooks.AfterTool!.length, 2);
  assert.match(result.diff, /^--- a\/\.gemini\/settings\.json\n\+\+\+ b\/\.gemini\/settings\.json/);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [GEMINI_SETTINGS_FILE]: await fixture("settings-with-existing.json") });
  const before = await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8");
  const result = await initGeminiHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["updated", false]);
  assert.match(result.diff, /\+.*hook gemini/);
  assert.equal(await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8"), before);
});

test("invalid JSON or an unexpected hooks shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"hooks": []}', '{"hooks": {"AfterTool": {}}}']) {
    const root = await repository({ [GEMINI_SETTINGS_FILE]: contents });
    await assert.rejects(initGeminiHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gemini", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.gemini\/settings\.json:/);
  assert.match(dry.stdout, /\+.*hook gemini/);
  await assert.rejects(readFile(join(root, GEMINI_SETTINGS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gemini", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(
    written.stdout,
    /Created \.gemini\/settings\.json; Gemini CLI now runs Evergreen after write_file and replace\./,
  );
  assert.match(
    await readFile(join(root, GEMINI_SETTINGS_FILE), "utf8"),
    /npx --no-install evergreen-deprecation hook gemini/,
  );

  const again = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gemini", root], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.gemini\/settings\.json already has the current Evergreen post-edit hook/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: claude-code, codex, cursor, gemini, or copilot/);
});

test("end to end: writing FROM node:16 returns AfterTool feedback with exit 0", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const edit: Record<string, unknown> = {
    ...((await payload("write-file.json")) as Record<string, unknown>),
    cwd: root,
    tool_input: { file_path: join(root, "Dockerfile"), content: "" },
  };

  const flagged = spawnSync(process.execPath, [cli, "hook", "gemini"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stderr, "");
  const document = JSON.parse(flagged.stdout) as {
    systemMessage: string;
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(document.hookSpecificOutput.hookEventName, "AfterTool");
  assert.match(document.systemMessage, /Evergreen found 1 lifecycle issue/);
  assert.match(
    document.hookSpecificOutput.additionalContext,
    /Node\.js image release lines 21 and older are end-of-life/,
  );
  assert.match(document.hookSpecificOutput.additionalContext, /Dockerfile:1/);
  assert.match(
    document.hookSpecificOutput.additionalContext,
    /Replacement: A node image on a supported release line, such as node:22/,
  );
  assert.match(document.hookSpecificOutput.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "22"));
  const clean: Record<string, unknown> = {
    ...edit,
    tool_input: { file_path: join(root, "Dockerfile"), content: "" },
  };
  const silent = spawnSync(process.execPath, [cli, "hook", "gemini"], {
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
