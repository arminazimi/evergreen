import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

interface Guard {
  addedDependencies(path: string, before: string, after: string): Array<{ purl: string; version?: string }>;
  changesFrom(payload: object, readPrevious?: (path: string) => string): { added: Array<{ purl: string; version?: string }> };
  run(payload: object, runner?: (purl: string, version?: string) => { check?: unknown; error?: string }): { systemMessage: string; hookSpecificOutput: { additionalContext: string } } | undefined;
}

const guardPath = resolve("integrations/dependency-guard/guard.mjs");
const guard = (await import(pathToFileURL(guardPath).href)) as Guard;
const purls = (added: Array<{ purl: string }>) => added.map((item) => item.purl).sort();

test("an npm edit reports only the dependencies it adds, with the lower bound of the range", () => {
  const before = '  "dependencies": {\n    "express": "^4.18.0"\n  }';
  const after = '  "dependencies": {\n    "express": "^4.18.0",\n    "request": "^2.88.2",\n    "@scope/pkg": "~1.2"\n  }';
  assert.deepEqual(guard.addedDependencies("package.json", before, after), [
    { purl: "pkg:npm/request", version: "2.88.2" },
    { purl: "pkg:npm/%40scope/pkg", version: "1.2.0" },
  ]);
  assert.deepEqual(guard.addedDependencies("package.json", after, after), []);
});

test("changing a version counts as adding it; fields that are not dependencies are ignored", () => {
  assert.deepEqual(guard.addedDependencies("package.json", '"left-pad": "^1.0.0"', '"left-pad": "^1.3.0"'), [{ purl: "pkg:npm/left-pad", version: "1.3.0" }]);
  assert.deepEqual(guard.addedDependencies("package.json", "", '"name": "demo", "version": "1.0.0", "main": "index.js"'), []);
});

test("Python requirements and pyproject dependencies are found", () => {
  const requirements = "# pinned\n-r base.txt\nnose==1.3.7\nDjango_Nose>=1.4\nrequests\nhttps://example.com/x.whl\n";
  assert.deepEqual(purls(guard.addedDependencies("requirements-dev.txt", "", requirements)), ["pkg:pypi/django-nose", "pkg:pypi/nose", "pkg:pypi/requests"]);
  assert.deepEqual(guard.addedDependencies("requirements.txt", "", "nose==1.3.7\n"), [{ purl: "pkg:pypi/nose", version: "1.3.7" }]);
  assert.deepEqual(purls(guard.addedDependencies("pyproject.toml", "", 'dependencies = [\n  "nose>=1.3",\n  "requests[socks]==2.31.0",\n]')), ["pkg:pypi/nose", "pkg:pypi/requests"]);
});

test("workflow actions are found only with a version, in workflows and action files", () => {
  const edit = "      - uses: actions/checkout@v4\n      - uses: actions/cache@v4.2.0\n      - uses: ./local\n      - uses: owner/repo/sub@main\n";
  assert.deepEqual(guard.addedDependencies(".github/workflows/ci.yml", "", edit), [
    { purl: "pkg:github/actions/checkout", version: "v4" },
    { purl: "pkg:github/actions/cache", version: "v4.2.0" },
  ]);
  assert.equal(guard.addedDependencies("action.yml", "", edit).length, 2);
  assert.deepEqual(guard.addedDependencies("notes.yml", "", edit), []);
});

test("Edit, MultiEdit, and Write payloads are understood, and other files are skipped", () => {
  const edit = { tool_name: "Edit", tool_input: { file_path: "/repo/package.json", old_string: "", new_string: '"request": "^2.88.2"' } };
  assert.deepEqual(purls(guard.changesFrom(edit).added), ["pkg:npm/request"]);
  const multi = { tool_name: "MultiEdit", tool_input: { file_path: "/repo/requirements.txt", edits: [{ old_string: "", new_string: "nose==1.3.7" }, { old_string: "", new_string: "pep8==1.7.1" }] } };
  assert.deepEqual(purls(guard.changesFrom(multi).added), ["pkg:pypi/nose", "pkg:pypi/pep8"]);
  const write = { tool_name: "Write", tool_input: { file_path: "/repo/requirements.txt", content: "nose==1.3.7\nrequests==2.31.0\n" } };
  assert.deepEqual(purls(guard.changesFrom(write, () => "requests==2.31.0\n").added), ["pkg:pypi/nose"]);
  assert.deepEqual(guard.changesFrom({ tool_name: "Edit", tool_input: { file_path: "/repo/src/index.ts", old_string: "", new_string: '"request": "1.0.0"' } }).added, []);
  assert.deepEqual(guard.changesFrom({ tool_name: "Read", tool_input: { file_path: "/repo/package.json" } }).added, []);
});

test("only affected dependencies produce a warning, and a failing check is reported, not hidden", () => {
  const payload = { tool_name: "Edit", tool_input: { file_path: "package.json", old_string: "", new_string: '"request": "^2.88.2", "express": "^4.0.0", "left-pad": "^1.3.0"' } };
  const affected = { status: "affected", purl: "pkg:npm/request", version: "2.88.2", findings: [{ title: "request is deprecated", severity: "high", event: "deprecated", summary: "No new changes are expected.", replacement: "Native fetch", deadline: "2020-02-11", sources: [{ url: "https://www.npmjs.com/package/request" }] }] };
  const output = guard.run(payload, (purl) => (purl.endsWith("/request") ? { check: affected } : purl.endsWith("/left-pad") ? { error: "offline" } : { check: { status: "no-data", findings: [] } }));
  assert.ok(output);
  assert.match(output.systemMessage, /1 deprecated dependency/);
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /pkg:npm\/request@2\.88\.2 — request is deprecated \(high, deprecated\)/);
  assert.match(context, /Replacement: Native fetch\./);
  assert.match(context, /Evidence: https:\/\/www\.npmjs\.com\/package\/request/);
  assert.match(context, /could not check: pkg:npm\/left-pad: offline/);
  assert.equal(guard.run({ tool_name: "Edit", tool_input: { file_path: "package.json", old_string: "", new_string: '"express": "^4.0.0"' } }, () => ({ check: { status: "no-data", findings: [] } })), undefined);
});

function runHook(payload: object): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [guardPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, EVERGREEN_CHECK_COMMAND: `${process.execPath} ${resolve("dist/src/cli.js")}` },
  });
  return { status: result.status, stdout: result.stdout };
}

test("the hook script warns for a real deprecated dependency and stays quiet otherwise", () => {
  const bad = runHook({ tool_name: "Edit", cwd: process.cwd(), tool_input: { file_path: "package.json", old_string: "", new_string: '"request": "^2.88.2"' } });
  assert.equal(bad.status, 0);
  const output = JSON.parse(bad.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(output.hookSpecificOutput.additionalContext, /request is deprecated/);

  const action = runHook({ tool_name: "Edit", cwd: process.cwd(), tool_input: { file_path: ".github/workflows/ci.yml", old_string: "", new_string: "- uses: actions/checkout@v4" } });
  assert.match(JSON.parse(action.stdout).hookSpecificOutput.additionalContext, /actions\/checkout/);

  for (const quiet of [
    { tool_name: "Edit", tool_input: { file_path: "package.json", old_string: "", new_string: '"express": "^4.18.0"' } },
    { tool_name: "Edit", tool_input: { file_path: "src/index.ts", old_string: "", new_string: '"request": "^2.88.2"' } },
    { tool_name: "Edit", tool_input: { file_path: ".github/workflows/ci.yml", old_string: "", new_string: "- uses: actions/checkout@v5" } },
  ]) {
    const result = runHook({ cwd: process.cwd(), ...quiet });
    assert.deepEqual([result.status, result.stdout], [0, ""]);
  }
  assert.deepEqual(runHook({}).stdout, "");
  assert.equal(spawnSync(process.execPath, [guardPath], { input: "not json", encoding: "utf8" }).status, 0);
});

test("the Claude plugin ships the guard with a pinned package and a PostToolUse hook", async () => {
  const hooks = JSON.parse(await readFile(resolve("plugins/claude/hooks/hooks.json"), "utf8")) as { hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> } };
  const [entry] = hooks.hooks.PostToolUse;
  assert.equal(entry!.matcher, "Write|Edit|MultiEdit");
  assert.match(entry!.hooks[0]!.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/dependency-guard\.mjs/);
  const { version } = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  const script = await readFile(resolve("plugins/claude/hooks/dependency-guard.mjs"), "utf8");
  assert.ok(script.includes(`"evergreen-deprecation@${version}"`));
  assert.ok(!script.includes("__EVERGREEN_PACKAGE__"));
});
