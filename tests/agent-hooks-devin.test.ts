import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import { devinAdapter, devinFeedbackText, devinResponse, parseDevinPayload } from "../src/agent-hooks/devin.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import {
  DEVIN_HOOK_COMMAND,
  DEVIN_HOOK_MATCHER,
  DEVIN_HOOK_TIMEOUT_SEC,
  DEVIN_HOOKS_FILE,
  initDevinHooks,
  withDevinPostToolUse,
} from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/devin", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-devin-"));
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

test("write, edit, and apply_patch payloads parse to repository-relative paths", async () => {
  const root = resolve("/Users/dev/app");
  const env = { DEVIN_PROJECT_DIR: "/Users/dev/app" };
  assert.deepEqual(parseDevinPayload(await payload("write.json"), env), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseDevinPayload(await payload("edit.json"), env), {
    root,
    files: ["packages/app/Dockerfile"],
  });
  assert.deepEqual(parseDevinPayload(await payload("apply-patch.json"), env), { root, files: ["Dockerfile"] });
});

test("DEVIN_PROJECT_DIR is required; other events and tools are not edit events", async () => {
  assert.equal(parseDevinPayload(await payload("write.json"), {}), undefined);
  assert.equal(parseDevinPayload(await payload("exec.json"), { DEVIN_PROJECT_DIR: "/Users/dev/app" }), undefined);
  assert.equal(
    parseDevinPayload(
      {
        hook_event_name: "PreToolUse",
        tool_name: "write",
        tool_input: { file_path: "Dockerfile" },
      },
      { DEVIN_PROJECT_DIR: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseDevinPayload(
      {
        hook_event_name: "PostToolUse",
        tool_name: "write",
        tool_input: { file_path: "/elsewhere/Dockerfile" },
        tool_response: { success: true },
      },
      { DEVIN_PROJECT_DIR: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseDevinPayload(
      {
        hook_event_name: "PostToolUse",
        tool_name: "write",
        tool_input: { file_path: "Dockerfile" },
        tool_response: { success: false },
      },
      { DEVIN_PROJECT_DIR: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(parseDevinPayload("not an object", { DEVIN_PROJECT_DIR: "/Users/dev/app" }), undefined);
});

test("findings come back as PostToolUse additionalContext with exit 0; stderr stays empty", () => {
  const response = devinAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "");
  const document = JSON.parse(response.stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(document.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(document.hookSpecificOutput.additionalContext, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(
    document.hookSpecificOutput.additionalContext,
    /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/,
  );
  assert.match(document.hookSpecificOutput.additionalContext, /Replacement: node:22/);
  assert.match(document.hookSpecificOutput.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success, and the feedback text is empty", () => {
  assert.deepEqual(devinAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(devinFeedbackText([]), "");
});

test("the feedback text stays within the line cap and says how many more", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = devinResponse(many);
  const context = (JSON.parse(response.stdout) as { hookSpecificOutput: { additionalContext: string } })
    .hookSpecificOutput.additionalContext;
  const lines = context.split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(context, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!context.includes("Replacement:"));
});

test("the hooks merge keeps existing events and hooks, and appends the PostToolUse entry", async () => {
  const before = JSON.parse(await fixture("hooks-with-existing.json")) as Record<string, unknown>;
  const { document, change } = withDevinPostToolUse(before);
  assert.equal(change, "added");
  assert.equal((document.PreToolUse as unknown[]).length, 1, "the user's PreToolUse hook is untouched");
  assert.equal((document.PostToolUse as unknown[]).length, 2, "the user's PostToolUse hook stays first");
  const entry = (document.PostToolUse as Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>)[1]!;
  assert.equal(entry.matcher, DEVIN_HOOK_MATCHER);
  assert.deepEqual(entry.hooks[0], {
    type: "command",
    command: DEVIN_HOOK_COMMAND,
    timeout: DEVIN_HOOK_TIMEOUT_SEC,
  });
  assert.equal(DEVIN_HOOK_MATCHER, "^(write|edit|apply_patch)$");
  assert.equal(DEVIN_HOOK_TIMEOUT_SEC, 60, "Devin timeouts are seconds");
  assert.equal((before.PostToolUse as unknown[]).length, 1, "the input is not mutated");
});

test("a new hooks file is created, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initDevinHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [DEVIN_HOOKS_FILE, "created", true]);
  const written = JSON.parse(await readFile(join(root, DEVIN_HOOKS_FILE), "utf8")) as {
    PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
  };
  assert.equal(written.PostToolUse.length, 1);
  assert.equal(written.PostToolUse[0]!.matcher, DEVIN_HOOK_MATCHER);
  assert.equal(written.PostToolUse[0]!.hooks[0]!.command, DEVIN_HOOK_COMMAND);

  const again = await initDevinHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, DEVIN_HOOKS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into existing hooks keeps every entry and prints a diff", async () => {
  const root = await repository({ [DEVIN_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const result = await initDevinHooks({ root });
  assert.equal(result.change, "updated");
  const written = JSON.parse(await readFile(join(root, DEVIN_HOOKS_FILE), "utf8")) as {
    PreToolUse: unknown[];
    PostToolUse: unknown[];
  };
  assert.equal(written.PreToolUse.length, 1);
  assert.equal(written.PostToolUse.length, 2);
  assert.match(result.diff, /^--- a\/\.devin\/hooks\.v1\.json\n\+\+\+ b\/\.devin\/hooks\.v1\.json/);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [DEVIN_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const before = await readFile(join(root, DEVIN_HOOKS_FILE), "utf8");
  const result = await initDevinHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["updated", false]);
  assert.match(result.diff, /\+.*hook devin/);
  assert.equal(await readFile(join(root, DEVIN_HOOKS_FILE), "utf8"), before);
});

test("invalid JSON or an unexpected hooks shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"PostToolUse": {}}']) {
    const root = await repository({ [DEVIN_HOOKS_FILE]: contents });
    await assert.rejects(initDevinHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, DEVIN_HOOKS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "devin", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.devin\/hooks\.v1\.json:/);
  assert.match(dry.stdout, /\+.*hook devin/);
  await assert.rejects(readFile(join(root, DEVIN_HOOKS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "devin", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(
    written.stdout,
    /Created \.devin\/hooks\.v1\.json; Devin Local now runs Evergreen after write, edit, and apply_patch\./,
  );
  assert.match(
    await readFile(join(root, DEVIN_HOOKS_FILE), "utf8"),
    /npx --no-install evergreen-deprecation hook devin/,
  );

  const again = spawnSync(process.execPath, [cli, "init", "--hooks-for", "devin", root], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.devin\/hooks\.v1\.json already has the current Evergreen post-edit hook/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: /);
  assert.match(unknown.stderr, /devin/);
});

test("end to end: writing FROM node:16 returns PostToolUse feedback with exit 0", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache, DEVIN_PROJECT_DIR: root };
  const edit: Record<string, unknown> = {
    ...((await payload("write.json")) as Record<string, unknown>),
    tool_input: { file_path: join(root, "Dockerfile"), content: "" },
  };

  const flagged = spawnSync(process.execPath, [cli, "hook", "devin"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stderr, "");
  const document = JSON.parse(flagged.stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(document.hookSpecificOutput.hookEventName, "PostToolUse");
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
  const silent = spawnSync(process.execPath, [cli, "hook", "devin"], {
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
