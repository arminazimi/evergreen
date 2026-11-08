import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { clineAdapter, clineFeedbackText, clineResponse, parseClinePayload } from "../src/agent-hooks/cline.js";
import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import { CLINE_HOOK_COMMAND, CLINE_HOOK_SCRIPT, CLINE_HOOKS_FILE, initClineHooks } from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/cline", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cline-"));
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

test("the extension and CLI payloads parse to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseClinePayload(await payload("post-tool-use.json"), {}), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseClinePayload(await payload("replace-in-file.json"), {}), {
    root,
    files: ["packages/app/Dockerfile"],
  });
  assert.deepEqual(parseClinePayload(await payload("tool-result.json"), {}), { root, files: ["Dockerfile"] });
});

test("PWD and cwd supply the root when the payload omits workspaceRoots", () => {
  const root = resolve("/Users/dev/app");
  const extension = {
    hookName: "PostToolUse",
    postToolUse: { toolName: "write_to_file", parameters: { path: "Dockerfile" }, success: true },
  };
  assert.deepEqual(parseClinePayload(extension, { PWD: "/Users/dev/app" }), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseClinePayload({ ...extension, cwd: "/Users/dev/app" }, {}), {
    root,
    files: ["Dockerfile"],
  });
  assert.deepEqual(
    parseClinePayload(
      {
        hookName: "tool_result",
        tool_result: { name: "write_file", input: { file_path: "Dockerfile" }, error: null },
      },
      { PWD: "/Users/dev/app" },
    ),
    { root, files: ["Dockerfile"] },
  );
});

test("other events, other tools, failed writes, and paths outside the workspace are not edit events", async () => {
  assert.equal(parseClinePayload(await payload("execute-command.json"), {}), undefined);
  assert.equal(
    parseClinePayload(
      {
        hookName: "PostToolUse",
        postToolUse: { toolName: "write_to_file", parameters: { path: "Dockerfile" }, success: false },
      },
      { PWD: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseClinePayload(
      {
        hookName: "tool_result",
        tool_result: { name: "write_file", input: { filePath: "Dockerfile" }, error: "disk full" },
      },
      { PWD: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseClinePayload(
      {
        hookName: "PreToolUse",
        postToolUse: { toolName: "write_to_file", parameters: { path: "Dockerfile" }, success: true },
      },
      { PWD: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseClinePayload(
      {
        hookName: "PostToolUse",
        workspaceRoots: ["/Users/dev/app"],
        postToolUse: { toolName: "write_to_file", parameters: { path: "/elsewhere/Dockerfile" }, success: true },
      },
      {},
    ),
    undefined,
  );
  assert.equal(parseClinePayload("not an object", {}), undefined);
  assert.equal(parseClinePayload({ hookName: "PostToolUse" }, {}), undefined);
  assert.equal(
    parseClinePayload(
      { hookName: "PostToolUse", postToolUse: { toolName: "execute_command", parameters: { path: "x" } } },
      { PWD: "/Users/dev/app" },
    ),
    undefined,
  );
  assert.equal(
    parseClinePayload(
      { hookName: "PostToolUse", postToolUse: { toolName: "write_to_file", parameters: {}, success: true } },
      { PWD: "/Users/dev/app" },
    ),
    undefined,
  );
});

test("findings come back as PostToolUse JSON with exit 0; stderr stays empty", () => {
  const response = clineAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "");
  const document = JSON.parse(response.stdout) as {
    cancel: boolean;
    contextModification: string;
    context: string;
  };
  assert.equal(document.cancel, false);
  assert.equal(document.context, document.contextModification);
  assert.match(document.contextModification, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(
    document.contextModification,
    /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/,
  );
  assert.match(document.contextModification, /Replacement: node:22/);
  assert.match(document.contextModification, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
  assert.match(document.contextModification, /Fix this before continuing; nothing was changed automatically\./);
});

test("no findings is a silent success, and the feedback text is empty", () => {
  assert.deepEqual(clineAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(clineFeedbackText([]), "");
});

test("the feedback text stays within the line cap and says how many more", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = clineResponse(many);
  const context = (JSON.parse(response.stdout) as { context: string }).context;
  const lines = context.split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(context, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!context.includes("Replacement:"));
});

test("the hook file is created executable, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initClineHooks({ root });
  assert.deepEqual([created.file, created.change, created.written], [CLINE_HOOKS_FILE, "created", true]);
  assert.equal(await readFile(join(root, CLINE_HOOKS_FILE), "utf8"), CLINE_HOOK_SCRIPT);
  assert.match(CLINE_HOOK_SCRIPT, new RegExp(`exec ${CLINE_HOOK_COMMAND}`));
  if (process.platform !== "win32") {
    const mode = (await stat(join(root, CLINE_HOOKS_FILE))).mode;
    assert.ok((mode & 0o111) !== 0, `hook mode ${mode.toString(8)} is executable`);
  }

  const again = await initClineHooks({ root });
  assert.deepEqual([again.change, again.written, again.diff], ["unchanged", false, ""]);
  assert.equal(await readFile(join(root, CLINE_HOOKS_FILE), "utf8"), CLINE_HOOK_SCRIPT);
});

test("a hook file Evergreen did not write is left untouched, and other hooks stay", async () => {
  const foreign = "#!/usr/bin/env bash\necho custom\n";
  const preToolUse = "#!/usr/bin/env bash\necho before\n";
  const root = await repository({
    [CLINE_HOOKS_FILE]: foreign,
    ".clinerules/hooks/PreToolUse": preToolUse,
  });
  await assert.rejects(initClineHooks({ root }), /already holds a hook Evergreen did not write/);
  assert.equal(await readFile(join(root, CLINE_HOOKS_FILE), "utf8"), foreign);
  assert.equal(await readFile(join(root, ".clinerules/hooks/PreToolUse"), "utf8"), preToolUse);

  const fresh = await repository({ ".clinerules/hooks/PreToolUse": preToolUse });
  await initClineHooks({ root: fresh });
  assert.equal(await readFile(join(fresh, ".clinerules/hooks/PreToolUse"), "utf8"), preToolUse);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository();
  const result = await initClineHooks({ root, dryRun: true });
  assert.deepEqual([result.change, result.written], ["created", false]);
  assert.match(result.diff, /^--- a\/\.clinerules\/hooks\/PostToolUse\n\+\+\+ b\/\.clinerules\/hooks\/PostToolUse/);
  assert.match(result.diff, /\+exec npx --no-install evergreen-deprecation hook cline/);
  await assert.rejects(readFile(join(root, CLINE_HOOKS_FILE), "utf8"));
});

test("the init command writes the hook and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cline", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.clinerules\/hooks\/PostToolUse:/);
  assert.match(dry.stdout, /\+exec npx --no-install evergreen-deprecation hook cline/);
  await assert.rejects(readFile(join(root, CLINE_HOOKS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cline", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(
    written.stdout,
    /Created \.clinerules\/hooks\/PostToolUse; Cline now runs Evergreen after write_to_file and replace_in_file/,
  );
  assert.match(await readFile(join(root, CLINE_HOOKS_FILE), "utf8"), /hook cline/);

  const again = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cline", root], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.clinerules\/hooks\/PostToolUse already has the current Evergreen post-edit hook/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: /);
});

test("end to end: writing FROM node:16 returns PostToolUse feedback with exit 0", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const edit: Record<string, unknown> = {
    ...((await payload("post-tool-use.json")) as Record<string, unknown>),
    workspaceRoots: [root],
    postToolUse: {
      toolName: "write_to_file",
      parameters: { path: join(root, "Dockerfile"), content: "" },
      result: "File written",
      success: true,
      executionTimeMs: 42,
    },
  };

  const flagged = spawnSync(process.execPath, [cli, "hook", "cline"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stderr, "");
  const document = JSON.parse(flagged.stdout) as { cancel: boolean; contextModification: string };
  assert.equal(document.cancel, false);
  assert.match(document.contextModification, /Node\.js image release lines 21 and older are end-of-life/);
  assert.match(document.contextModification, /Dockerfile:1/);
  assert.match(document.contextModification, /Replacement: A node image on a supported release line, such as node:22/);
  assert.match(document.contextModification, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "22"));
  const silent = spawnSync(process.execPath, [cli, "hook", "cline"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(silent.status, 0, silent.stderr);
  assert.deepEqual([silent.stdout, silent.stderr], ["", ""]);
  assert.equal(
    await readFile(join(root, "Dockerfile"), "utf8"),
    'FROM node:22\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]\n',
    "the hook never edits files",
  );
});
