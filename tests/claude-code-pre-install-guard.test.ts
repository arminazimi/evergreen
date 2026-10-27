import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

interface PreInstallGuard {
  shellSegments(command: string): string[];
  packagesFromSegment(segment: string): Array<{ purl: string; version?: string; spec: string }>;
  installPackages(command: string): Array<{ purl: string; version?: string; spec: string }>;
  denialFor(check: {
    purl: string;
    version?: string;
    findings: Array<{ title: string; severity: string; event: string; summary: string; replacement?: string; deadline?: string; sources: Array<{ url: string }> }>;
  }): string;
  run(
    payload: object,
    runner?: (purl: string, version?: string) => { check?: unknown; error?: string },
  ): { systemMessage: string; hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } } | undefined;
}

const guardPath = resolve("integrations/claude-code/pre-install-guard.mjs");
const guard = (await import(pathToFileURL(guardPath).href)) as PreInstallGuard;
const purls = (entries: Array<{ purl: string }>) => entries.map((entry) => entry.purl).sort();

const affectedRequest = {
  status: "affected",
  purl: "pkg:npm/request",
  version: "2.88.2",
  findings: [
    {
      title: "request is deprecated",
      severity: "high",
      event: "deprecated",
      summary: "No new changes are expected.",
      replacement: "Native fetch or a maintained HTTP client",
      sources: [{ url: "https://www.npmjs.com/package/request" }],
    },
  ],
};

test("shell segments split on &&, ||, and ; outside quotes", () => {
  assert.deepEqual(guard.shellSegments('npm install a && echo "x && y" || pip install b; yarn add c'), [
    "npm install a",
    'echo "x && y"',
    "pip install b",
    "yarn add c",
  ]);
});

test("npm, pnpm, and yarn install arguments become npm PURLs", () => {
  assert.deepEqual(guard.packagesFromSegment("npm install --save-dev request@2.88.2 @scope/pkg@1.2"), [
    { purl: "pkg:npm/request", version: "2.88.2", spec: "request@2.88.2" },
    { purl: "pkg:npm/%40scope/pkg", version: "1.2.0", spec: "@scope/pkg@1.2" },
  ]);
  assert.deepEqual(purls(guard.packagesFromSegment("pnpm add left-pad@1.3.0")), ["pkg:npm/left-pad"]);
  assert.deepEqual(purls(guard.packagesFromSegment("yarn global add request@2.88.2")), ["pkg:npm/request"]);
  assert.deepEqual(guard.packagesFromSegment("npm install"), []);
  assert.deepEqual(guard.packagesFromSegment("npm ci"), []);
  assert.deepEqual(guard.packagesFromSegment("npm test"), []);
});

test("pip and uv install arguments become PyPI PURLs", () => {
  assert.deepEqual(guard.packagesFromSegment("pip install nose==1.3.7 Django_Nose>=1.4"), [
    { purl: "pkg:pypi/nose", version: "1.3.7", spec: "nose==1.3.7" },
    { purl: "pkg:pypi/django-nose", version: "1.4.0", spec: "Django_Nose>=1.4" },
  ]);
  assert.deepEqual(purls(guard.packagesFromSegment("python -m pip install requests")), ["pkg:pypi/requests"]);
  assert.deepEqual(purls(guard.packagesFromSegment("uv add nose==1.3.7")), ["pkg:pypi/nose"]);
  assert.deepEqual(purls(guard.packagesFromSegment("uv pip install pep8==1.7.1")), ["pkg:pypi/pep8"]);
  assert.deepEqual(guard.packagesFromSegment("pip install -r requirements.txt"), []);
});

test("install packages are collected across chained shell segments", () => {
  assert.deepEqual(purls(guard.installPackages("npm install request@2.88.2 && pip install nose==1.3.7")), [
    "pkg:npm/request",
    "pkg:pypi/nose",
  ]);
});

test("an affected package produces a PreToolUse deny with reason and replacement", () => {
  const output = guard.run(
    { tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } },
    (purl) => (purl.endsWith("/request") ? { check: affectedRequest } : { check: { status: "no-data", findings: [] } }),
  );
  assert.ok(output);
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /pkg:npm\/request@2\.88\.2 — request is deprecated/);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Replacement: Native fetch or a maintained HTTP client/);
  assert.match(output.systemMessage, /blocked 1 deprecated/);
});

test("safe installs, missing rules, check errors, and EVERGREEN_SKIP do not block", () => {
  assert.equal(
    guard.run({ tool_name: "Bash", tool_input: { command: "npm install express@4.18.0" } }, () => ({ check: { status: "no-data", findings: [] } })),
    undefined,
  );
  assert.equal(
    guard.run({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } }, () => ({ error: "offline" })),
    undefined,
  );
  assert.equal(guard.run({ tool_name: "Bash", tool_input: { command: "npm test" } }, () => ({ check: affectedRequest })), undefined);
  assert.equal(guard.run({ tool_name: "Edit", tool_input: { command: "npm install request@2.88.2" } }, () => ({ check: affectedRequest })), undefined);

  const previous = process.env.EVERGREEN_SKIP;
  process.env.EVERGREEN_SKIP = "1";
  try {
    assert.equal(guard.run({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } }, () => ({ check: affectedRequest })), undefined);
  } finally {
    if (previous === undefined) delete process.env.EVERGREEN_SKIP;
    else process.env.EVERGREEN_SKIP = previous;
  }
});

function runHook(payload: object, checkCommand = `"${process.execPath}" "${resolve("dist/src/cli.js")}"`, env: NodeJS.ProcessEnv = process.env): {
  status: number | null;
  stdout: string;
} {
  const result = spawnSync(process.execPath, [guardPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...env, EVERGREEN_CHECK_COMMAND: checkCommand },
  });
  return { status: result.status, stdout: result.stdout };
}

test("the hook script blocks a real deprecated package install and stays quiet otherwise", () => {
  const blocked = runHook({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } });
  assert.equal(blocked.status, 0);
  const output = JSON.parse(blocked.stdout) as {
    hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /request is deprecated/);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Replacement:/);

  for (const quiet of [
    { tool_name: "Bash", tool_input: { command: "npm install express@4.18.0" } },
    { tool_name: "Bash", tool_input: { command: "npm test" } },
    { tool_name: "Bash", tool_input: { command: "pip install -r requirements.txt" } },
    {},
  ]) {
    const result = runHook(quiet);
    assert.deepEqual([result.status, result.stdout], [0, ""]);
  }

  assert.equal(spawnSync(process.execPath, [guardPath], { input: "not json", encoding: "utf8" }).status, 0);

  const skipped = runHook(
    { tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } },
    `"${process.execPath}" "${resolve("dist/src/cli.js")}"`,
    { ...process.env, EVERGREEN_SKIP: "1" },
  );
  assert.deepEqual([skipped.status, skipped.stdout], [0, ""]);
});

test("hooks.json matches Bash PreToolUse and docs cover install and opt-out", async () => {
  const hooks = JSON.parse(await readFile(resolve("integrations/claude-code/hooks.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
  };
  const [entry] = hooks.hooks.PreToolUse;
  assert.equal(entry!.matcher, "Bash");
  assert.match(entry!.hooks[0]!.command, /pre-install-guard\.mjs/);

  const docs = await readFile(resolve("docs/HOOKS.md"), "utf8");
  assert.match(docs, /Claude Code/);
  assert.match(docs, /PreToolUse/);
  assert.match(docs, /EVERGREEN_SKIP=1/);
  assert.match(docs, /disableAllHooks/);
  assert.match(docs, /pre-install-guard\.mjs/);
});
