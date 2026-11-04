import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { codexAdapter, codexFeedbackText, codexResponse, parseCodexPayload, patchFileNames } from "../src/agent-hooks/codex.js";
import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import { CODEX_HOOK_COMMAND, CODEX_HOOK_MATCHER, CODEX_HOOKS_FILE, initCodexHooks, withCodexPostToolUse } from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/codex", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-codex-"));
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

test("a single-file patch payload parses to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseCodexPayload(await payload("patch-update.json"), {}), { root, files: ["Dockerfile"] });
});

test("a multi-file patch yields every added and updated file, in order, without the deleted one", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseCodexPayload(await payload("patch-multi.json"), {}), { root, files: ["scripts/healthcheck.js", "Dockerfile"] });
  const multi = (await payload("patch-multi.json")) as { tool_input: { command: string } };
  assert.deepEqual(patchFileNames(multi.tool_input.command), ["scripts/healthcheck.js", "Dockerfile"]);
});

test("patch headers are read for add and update only, duplicates collapse, and a bare header is ignored", () => {
  assert.deepEqual(patchFileNames("*** Begin Patch\n*** Update File: a.ts\n*** Update File: a.ts\n*** Add File: b.ts\n*** Delete File: c.ts\n*** Update File:  \n*** End Patch"), ["a.ts", "b.ts"]);
  assert.deepEqual(patchFileNames("*** Begin Patch\n*** Delete File: only-removal.ts\n*** End Patch"), []);
});

test("other tools and payloads without a changed file are not edit events", async () => {
  assert.equal(parseCodexPayload(await payload("bash.json"), {}), undefined);
  assert.equal(parseCodexPayload({ tool_name: "apply_patch", tool_input: {}, cwd: "/Users/dev/app" }, {}), undefined);
  assert.equal(parseCodexPayload({ tool_name: "apply_patch", cwd: "/Users/dev/app" }, {}), undefined);
  assert.equal(parseCodexPayload({ tool_name: "WebSearch", tool_input: { command: "*** Update File: Dockerfile" }, cwd: "/Users/dev/app" }, {}), undefined);
  assert.equal(parseCodexPayload("not an object", {}), undefined);
});

test("Edit and Write tool names carry one file path; CODEX_PROJECT_DIR supplies the root", () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseCodexPayload({ tool_name: "Edit", tool_input: { file_path: "Dockerfile" }, cwd: "/Users/dev/app" }, {}), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseCodexPayload({ tool_name: "Write", tool_input: { file_path: "packages/app/Dockerfile" } }, { CODEX_PROJECT_DIR: "/Users/dev/app" }), {
    root,
    files: ["packages/app/Dockerfile"],
  });
});

test("paths that leave the repository root are dropped, and a patch of only such paths is not an edit", () => {
  assert.equal(parseCodexPayload({ tool_name: "apply_patch", tool_input: { command: "*** Update File: ../outside/Dockerfile\n*** Add File: /etc/hosts" }, cwd: "/Users/dev/app" }, {}), undefined);
  assert.deepEqual(
    parseCodexPayload({ tool_name: "apply_patch", tool_input: { command: "*** Update File: ../outside/Dockerfile\n*** Add File: Dockerfile" }, cwd: "/Users/dev/app" }, {}),
    { root: resolve("/Users/dev/app"), files: ["Dockerfile"] },
  );
});

test("findings come back as Codex stdout JSON: systemMessage plus hookSpecificOutput.additionalContext, exit 0", () => {
  const response = codexAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "");
  const document = JSON.parse(response.stdout) as {
    systemMessage: string;
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(document.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(document.systemMessage, /Evergreen found 1 lifecycle issue/);
  assert.match(document.hookSpecificOutput.additionalContext, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(document.hookSpecificOutput.additionalContext, /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/);
  assert.match(document.hookSpecificOutput.additionalContext, /Replacement: node:22/);
  assert.match(document.hookSpecificOutput.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success, and the feedback text is empty", () => {
  assert.deepEqual(codexAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(codexFeedbackText([]), "");
});

test("feedback stays within the line cap, says how many more, and omits a missing replacement", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = codexResponse(many);
  const document = JSON.parse(response.stdout) as { hookSpecificOutput: { additionalContext: string } };
  const lines = document.hookSpecificOutput.additionalContext.trimEnd().split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(document.hookSpecificOutput.additionalContext, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!document.hookSpecificOutput.additionalContext.includes("Replacement:"));
  assert.equal(codexFeedbackText([finding("a:Dockerfile:1")]).split("\n").length <= MAX_FEEDBACK_LINES, true);
});

test("the hooks merge keeps user hooks and appends the post-edit entry", async () => {
  const before = JSON.parse(await fixture("hooks-with-existing.json")) as Record<string, unknown>;
  const { hooks, change } = withCodexPostToolUse(before);
  assert.equal(change, "added");
  assert.equal(hooks.description, "Optional lifecycle hooks for this workspace.");
  const events = hooks.hooks as Record<string, unknown[]>;
  assert.equal(events.PreToolUse!.length, 1, "the user pre-tool hook is untouched");
  assert.equal(events.PostToolUse!.length, 2, "the user hook stays first");
  const entry = events.PostToolUse![1] as { matcher: string; hooks: Array<{ command: string }> };
  assert.equal(entry.matcher, CODEX_HOOK_MATCHER);
  assert.equal(entry.hooks[0]!.command, CODEX_HOOK_COMMAND);
  assert.equal((before.hooks as Record<string, unknown[]>).PostToolUse!.length, 1, "the input is not mutated");
});

test("a new hooks file is created, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initCodexHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [CODEX_HOOKS_FILE, "created", true]);
  const written = JSON.parse(await readFile(join(root, CODEX_HOOKS_FILE), "utf8")) as { hooks: Record<string, Array<{ matcher: string }>> };
  assert.equal(written.hooks.PostToolUse!.length, 1);
  assert.equal(written.hooks.PostToolUse![0]!.matcher, CODEX_HOOK_MATCHER);

  const again = await initCodexHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, CODEX_HOOKS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into an existing hooks file keeps every existing entry", async () => {
  const root = await repository({ [CODEX_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const result = await initCodexHooks({ root });
  assert.equal(result.change, "updated");
  const written = JSON.parse(await readFile(join(root, CODEX_HOOKS_FILE), "utf8")) as { hooks: Record<string, unknown[]> };
  assert.equal(written.hooks.PreToolUse!.length, 1);
  assert.equal(written.hooks.PostToolUse!.length, 2);
  assert.match(result.diff, /^--- a\/\.codex\/hooks\.json\n\+\+\+ b\/\.codex\/hooks\.json/);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [CODEX_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const before = await readFile(join(root, CODEX_HOOKS_FILE), "utf8");
  const result = await initCodexHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["updated", false]);
  assert.match(result.diff, /\+.*hook codex/);
  assert.equal(await readFile(join(root, CODEX_HOOKS_FILE), "utf8"), before);
});

test("invalid JSON or an unexpected hooks shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"hooks": []}', '{"hooks": {"PostToolUse": {}}}']) {
    const root = await repository({ [CODEX_HOOKS_FILE]: contents });
    await assert.rejects(initCodexHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, CODEX_HOOKS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "codex", root, "--dry-run"], { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.codex\/hooks\.json:/);
  await assert.rejects(readFile(join(root, CODEX_HOOKS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "codex", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(written.stdout, /Codex now runs Evergreen after apply_patch/);
  assert.match(await readFile(join(root, CODEX_HOOKS_FILE), "utf8"), /npx --no-install evergreen-deprecation hook codex/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: claude-code or codex/);
});

test("end to end: a patch that writes FROM node:16 gets the rule and replacement back on stdout as JSON", async () => {
  const root = await repository();
  const template = await fixture("repo/Dockerfile.template");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const patch: Record<string, unknown> = { ...((await payload("patch-update.json")) as Record<string, unknown>), cwd: root };
  patch["tool_input"] = { command: "*** Begin Patch\n*** Update File: Dockerfile\n@@\n-FROM node:22\n+FROM node:16\n*** End Patch\n" };

  const flagged = spawnSync(process.execPath, [cli, "hook", "codex"], { encoding: "utf8", env, input: JSON.stringify(patch) });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stderr, "");
  const document = JSON.parse(flagged.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(document.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(document.hookSpecificOutput.additionalContext, /Node\.js image release lines 21 and older are end-of-life/);
  assert.match(document.hookSpecificOutput.additionalContext, /Dockerfile:1/);
  assert.match(document.hookSpecificOutput.additionalContext, /Replacement: A node image on a supported release line, such as node:22/);
  assert.match(document.hookSpecificOutput.additionalContext, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  const clean: Record<string, unknown> = { ...((await payload("patch-update.json")) as Record<string, unknown>), cwd: root };
  clean["tool_input"] = { command: "*** Begin Patch\n*** Update File: README.md\n@@\n-# App\n+# App\n*** End Patch\n" };
  const silent = spawnSync(process.execPath, [cli, "hook", "codex"], { encoding: "utf8", env, input: JSON.stringify(clean) });
  assert.equal(silent.status, 0, silent.stderr);
  assert.deepEqual([silent.stdout, silent.stderr], ["", ""]);
  assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), "FROM node:16\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"index.js\"]\n", "the hook never edits files");
});
