import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { cursorAdapter, cursorAuditText, cursorResponse, parseCursorPayload } from "../src/agent-hooks/cursor.js";
import { MAX_FEEDBACK_LINES } from "../src/agent-hooks/claude-code.js";
import type { HookResponse } from "../src/agent-hooks/types.js";
import type { Finding } from "../src/domain.js";
import {
  CURSOR_HOOK_COMMAND,
  CURSOR_HOOKS_FILE,
  CURSOR_RULES_FILE,
  initCursorHooks,
  withCursorAfterFileEdit,
} from "../src/init-agents.js";

const fixture = (name: string) => readFile(resolve("tests/fixtures/agent-hooks/cursor", name), "utf8");
const payload = async (name: string) => JSON.parse(await fixture(name)) as unknown;
const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cursor-"));
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

test("an afterFileEdit payload parses to one repository-relative path", async () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(parseCursorPayload(await payload("after-edit.json"), {}), { root, files: ["Dockerfile"] });
  assert.deepEqual(parseCursorPayload(await payload("after-edit-relative.json"), {}), {
    root,
    files: ["packages/app/Dockerfile"],
  });
});

test("CURSOR_PROJECT_DIR supplies the root when workspace_roots is absent", () => {
  const root = resolve("/Users/dev/app");
  assert.deepEqual(
    parseCursorPayload({ file_path: "/Users/dev/app/Dockerfile", edits: [] }, { CURSOR_PROJECT_DIR: "/Users/dev/app" }),
    { root, files: ["Dockerfile"] },
  );
});

test("other events and paths outside the workspace are not edit events", async () => {
  assert.equal(parseCursorPayload(await payload("session-start.json"), {}), undefined);
  assert.equal(parseCursorPayload({ file_path: "/Users/dev/app/Dockerfile", edits: [] }, {}), undefined);
  assert.equal(
    parseCursorPayload(
      {
        hook_event_name: "afterFileEdit",
        file_path: "/elsewhere/Dockerfile",
        workspace_roots: ["/Users/dev/app"],
      },
      {},
    ),
    undefined,
  );
  assert.equal(parseCursorPayload("not an object", {}), undefined);
});

test("findings come back as an audit log on stderr with exit 0; stdout stays empty", () => {
  const response = cursorAdapter.respond([finding("container.node.eol-21-and-older:Dockerfile:1")]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stdout, "");
  assert.match(response.stderr, /Evergreen found 1 lifecycle issue in Dockerfile:/);
  assert.match(response.stderr, /\[high\] Rule container\.node\.eol-21-and-older:Dockerfile:1 — Dockerfile:1/);
  assert.match(response.stderr, /Replacement: node:22/);
  assert.match(response.stderr, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);
});

test("no findings is a silent success, and the audit text is empty", () => {
  assert.deepEqual(cursorAdapter.respond([]), { stdout: "", stderr: "", exitCode: 0 });
  assert.equal(cursorAuditText([]), "");
});

test("audit text stays within the line cap and says how many more", () => {
  const many = Array.from({ length: 30 }, (_, index) => {
    const { replacement: _replacement, ...bare } = finding(`rule-${index}:Dockerfile:${index + 1}`);
    return bare;
  });
  const response: HookResponse = cursorResponse(many);
  const lines = response.stderr.trimEnd().split("\n");
  assert.ok(lines.length <= MAX_FEEDBACK_LINES, `${lines.length} lines`);
  assert.match(response.stderr, /and \d+ more findings; run `evergreen scan \.` to see them all\./);
  assert.ok(!response.stderr.includes("Replacement:"));
});

test("the hooks merge keeps user hooks and appends the afterFileEdit entry", async () => {
  const before = JSON.parse(await fixture("hooks-with-existing.json")) as Record<string, unknown>;
  const { document, change } = withCursorAfterFileEdit(before);
  assert.equal(change, "added");
  assert.equal(document.description, "Optional lifecycle hooks for this workspace.");
  assert.equal(document.version, 1);
  const events = document.hooks as Record<string, unknown[]>;
  assert.equal(events.beforeSubmitPrompt!.length, 1, "the user prompt hook is untouched");
  assert.equal(events.afterFileEdit!.length, 2, "the user hook stays first");
  const entry = events.afterFileEdit![1] as { command: string; timeout: number };
  assert.equal(entry.command, CURSOR_HOOK_COMMAND);
  assert.equal(entry.timeout, 60);
  assert.equal((before.hooks as Record<string, unknown[]>).afterFileEdit!.length, 1, "the input is not mutated");
});

test("a new hooks file is created with the rule, and a second run changes nothing", async () => {
  const root = await repository();
  const created = await initCursorHooks({ root });
  assert.deepEqual(
    [created.hooks.file, created.hooks.change, created.hooks.written],
    [CURSOR_HOOKS_FILE, "created", true],
  );
  assert.equal(created.rule.change, "created");
  assert.equal(created.rule.written, true);
  const written = JSON.parse(await readFile(join(root, CURSOR_HOOKS_FILE), "utf8")) as {
    version: number;
    hooks: Record<string, Array<{ command: string }>>;
  };
  assert.equal(written.version, 1);
  assert.equal(written.hooks.afterFileEdit!.length, 1);
  assert.equal(written.hooks.afterFileEdit![0]!.command, CURSOR_HOOK_COMMAND);
  assert.match(await readFile(join(root, CURSOR_RULES_FILE), "utf8"), /alwaysApply: true/);

  const again = await initCursorHooks({ root });
  assert.deepEqual([again.hooks.change, again.hooks.written, again.hooks.diff], ["unchanged", false, ""]);
  assert.equal(again.rule.change, "unchanged");
  assert.equal(await readFile(join(root, CURSOR_HOOKS_FILE), "utf8"), `${JSON.stringify(written, null, 2)}\n`);
});

test("merging into an existing hooks file keeps every existing entry and the rule", async () => {
  const root = await repository({ [CURSOR_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const result = await initCursorHooks({ root });
  assert.equal(result.hooks.change, "updated");
  assert.equal(result.rule.change, "created");
  const written = JSON.parse(await readFile(join(root, CURSOR_HOOKS_FILE), "utf8")) as {
    hooks: Record<string, unknown[]>;
  };
  assert.equal(written.hooks.beforeSubmitPrompt!.length, 1);
  assert.equal(written.hooks.afterFileEdit!.length, 2);
  assert.match(result.hooks.diff, /^--- a\/\.cursor\/hooks\.json\n\+\+\+ b\/\.cursor\/hooks\.json/);
});

test("--dry-run reports the diff and writes nothing", async () => {
  const root = await repository({ [CURSOR_HOOKS_FILE]: await fixture("hooks-with-existing.json") });
  const before = await readFile(join(root, CURSOR_HOOKS_FILE), "utf8");
  const result = await initCursorHooks({ root, dryRun: true });
  assert.deepEqual([result.hooks.change, result.hooks.written], ["updated", false]);
  assert.match(result.hooks.diff, /\+.*hook cursor/);
  assert.equal(result.rule.written, false);
  assert.equal(await readFile(join(root, CURSOR_HOOKS_FILE), "utf8"), before);
  await assert.rejects(readFile(join(root, CURSOR_RULES_FILE), "utf8"));
});

test("invalid JSON or an unexpected hooks shape is refused with the file untouched", async () => {
  for (const contents of ["{not json", "[]", '{"hooks": []}', '{"hooks": {"afterFileEdit": {}}}']) {
    const root = await repository({ [CURSOR_HOOKS_FILE]: contents });
    await assert.rejects(initCursorHooks({ root }), /not changed/);
    assert.equal(await readFile(join(root, CURSOR_HOOKS_FILE), "utf8"), contents);
  }
});

test("the init command writes the hook and rule and honors --dry-run", async () => {
  const root = await repository();
  const cli = resolve("dist/src/cli.js");
  const dry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", root, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would create \.cursor\/hooks\.json:/);
  assert.match(dry.stdout, /Would create \.cursor\/rules\/evergreen\.mdc:/);
  await assert.rejects(readFile(join(root, CURSOR_HOOKS_FILE), "utf8"));

  const written = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", root], { encoding: "utf8" });
  assert.equal(written.status, 0, written.stderr);
  assert.match(written.stdout, /Cursor now runs Evergreen afterFileEdit/);
  assert.match(written.stdout, /Created \.cursor\/rules\/evergreen\.mdc/);
  assert.match(
    await readFile(join(root, CURSOR_HOOKS_FILE), "utf8"),
    /npx --no-install evergreen-deprecation hook cursor/,
  );

  const again = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", root], { encoding: "utf8" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.cursor\/hooks\.json already has the current Evergreen post-edit hook/);
  assert.match(again.stdout, /\.cursor\/rules\/evergreen\.mdc already has the current Evergreen section/);

  const unknown = spawnSync(process.execPath, [cli, "init", "--hooks-for", "gitlab", root], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--hooks-for needs a host: claude-code, codex, cursor, gemini, or copilot/);
});

test("the init command merges hooks and prints added and updated rule results", async () => {
  const { SECTION_BEGIN, SECTION_END } = await import("../src/agent-instructions.js");
  const cli = resolve("dist/src/cli.js");

  const addRoot = await repository({
    [CURSOR_HOOKS_FILE]: await fixture("hooks-with-existing.json"),
    [CURSOR_RULES_FILE]: "---\ndescription: local\nalwaysApply: true\n---\n\n# Local notes\n",
  });
  const addDry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", addRoot, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(addDry.status, 0, addDry.stderr);
  assert.match(addDry.stdout, /Would update \.cursor\/hooks\.json:/);
  assert.match(addDry.stdout, /Would add the Evergreen section to \.cursor\/rules\/evergreen\.mdc:/);
  const added = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", addRoot], { encoding: "utf8" });
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /Updated \.cursor\/hooks\.json; Cursor now runs Evergreen afterFileEdit/);
  assert.match(added.stdout, /Added the Evergreen section to \.cursor\/rules\/evergreen\.mdc/);
  assert.match(await readFile(join(addRoot, CURSOR_RULES_FILE), "utf8"), /# Local notes/);

  const updateRoot = await repository({
    [CURSOR_HOOKS_FILE]: JSON.stringify(
      {
        version: 1,
        hooks: { afterFileEdit: [{ command: "npx --no-install evergreen-deprecation hook cursor", timeout: 60 }] },
      },
      null,
      2,
    ),
    [CURSOR_RULES_FILE]: `---\ndescription: stale\nalwaysApply: true\n---\n\n${SECTION_BEGIN}\nAn old section.\n${SECTION_END}\n`,
  });
  const updateDry = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", updateRoot, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(updateDry.status, 0, updateDry.stderr);
  assert.match(updateDry.stdout, /\.cursor\/hooks\.json already has the current Evergreen post-edit hook/);
  assert.match(updateDry.stdout, /Would update \.cursor\/rules\/evergreen\.mdc:/);
  const updated = spawnSync(process.execPath, [cli, "init", "--hooks-for", "cursor", updateRoot], {
    encoding: "utf8",
  });
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(updated.stdout, /\.cursor\/hooks\.json already has the current Evergreen post-edit hook/);
  assert.match(updated.stdout, /Updated the Evergreen section in \.cursor\/rules\/evergreen\.mdc/);
  assert.match(await readFile(join(updateRoot, CURSOR_RULES_FILE), "utf8"), /check_dependency/);
});

test("end to end: writing FROM node:16 audits on stderr with exit 0 (Cursor cannot feed the agent)", async () => {
  const root = await repository();
  const template = await fixture("repo/image.template.fixture");
  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "16"));
  await writeFile(join(root, "README.md"), "# App\n");
  const cache = await repository();
  const cli = resolve("dist/src/cli.js");
  const env = { ...process.env, EVERGREEN_CACHE_DIR: cache };
  const edit: Record<string, unknown> = {
    ...((await payload("after-edit.json")) as Record<string, unknown>),
    workspace_roots: [root],
    file_path: join(root, "Dockerfile"),
  };

  const flagged = spawnSync(process.execPath, [cli, "hook", "cursor"], {
    encoding: "utf8",
    env,
    input: JSON.stringify(edit),
  });
  assert.equal(flagged.status, 0, flagged.stderr);
  assert.equal(flagged.stdout, "");
  assert.match(flagged.stderr, /Node\.js image release lines 21 and older are end-of-life/);
  assert.match(flagged.stderr, /Dockerfile:1/);
  assert.match(flagged.stderr, /Replacement: A node image on a supported release line, such as node:22/);
  assert.match(flagged.stderr, /Evidence: https:\/\/nodejs\.org\/en\/about\/eol/);

  await writeFile(join(root, "Dockerfile"), template.replace("{{NODE_LINE}}", "22"));
  const clean: Record<string, unknown> = {
    ...edit,
    file_path: join(root, "README.md"),
  };
  const silent = spawnSync(process.execPath, [cli, "hook", "cursor"], {
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
