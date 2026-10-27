import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

interface PreInstallGuard {
  shellSegments(command: string): string[];
  packagesFromSegment(segment: string): Array<{ purl: string; version?: string; spec: string }>;
  installPackages(command: string): Array<{ purl: string; version?: string; spec: string }>;
  isEntryPoint(entry?: string, metaUrl?: string): boolean;
  denialFor(check: {
    purl: string;
    version?: string;
    findings: Array<{ title: string; severity: string; event: string; summary: string; replacement?: string; deadline?: string; sources: Array<{ url: string }> }>;
  }): string;
  run(
    payload: object,
    runner?: (purl: string, version?: string) => { check?: unknown; error?: string } | Promise<{ check?: unknown; error?: string }>,
  ): Promise<{ systemMessage: string; hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } } | undefined>;
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

test("shell segments also split on newlines, a single pipe, and a single ampersand", () => {
  assert.deepEqual(purls(guard.installPackages("cd app\nnpm install request@2.88.2")), ["pkg:npm/request"]);
  assert.deepEqual(purls(guard.installPackages("echo y | npm i request@2.88.2")), ["pkg:npm/request"]);
  assert.deepEqual(purls(guard.installPackages("true & npm install request@2.88.2")), ["pkg:npm/request"]);
  assert.deepEqual(guard.shellSegments("cd app\r\nnpm install request"), ["cd app", "npm install request"]);
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

test("an affected package produces a PreToolUse deny with reason and replacement", async () => {
  const output = await guard.run(
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

test("safe installs, missing rules, check errors, and timeouts do not block", async () => {
  assert.equal(
    await guard.run({ tool_name: "Bash", tool_input: { command: "npm install express@4.18.0" } }, () => ({ check: { status: "no-data", findings: [] } })),
    undefined,
  );
  assert.equal(
    await guard.run({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } }, () => ({ error: "offline" })),
    undefined,
  );
  assert.equal(
    await guard.run({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } }, () => ({ error: "evergreen check timed out" })),
    undefined,
  );
  assert.equal(await guard.run({ tool_name: "Bash", tool_input: { command: "npm test" } }, () => ({ check: affectedRequest })), undefined);
  assert.equal(await guard.run({ tool_name: "Edit", tool_input: { command: "npm install request@2.88.2" } }, () => ({ check: affectedRequest })), undefined);
});

test("EVERGREEN_SKIP treats only 1 and true as skip", async () => {
  const previous = process.env.EVERGREEN_SKIP;
  const payload = { tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } };
  const runner = () => ({ check: affectedRequest });
  try {
    process.env.EVERGREEN_SKIP = "1";
    assert.equal(await guard.run(payload, runner), undefined);
    process.env.EVERGREEN_SKIP = "true";
    assert.equal(await guard.run(payload, runner), undefined);
    process.env.EVERGREEN_SKIP = "TRUE";
    assert.equal(await guard.run(payload, runner), undefined);
    process.env.EVERGREEN_SKIP = "0";
    assert.ok(await guard.run(payload, runner));
    process.env.EVERGREEN_SKIP = "false";
    assert.ok(await guard.run(payload, runner));
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

test("the hook still runs when argv points at a symlink to the script", () => {
  const dir = mkdtempSync(join(tmpdir(), "evergreen-pre-install-"));
  const link = join(dir, "pre-install-guard.mjs");
  symlinkSync(guardPath, link);
  try {
    assert.equal(guard.isEntryPoint(link, pathToFileURL(realpathSync(guardPath)).href), true);
    const result = spawnSync(process.execPath, [link], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm install request@2.88.2" } }),
      encoding: "utf8",
      env: { ...process.env, EVERGREEN_CHECK_COMMAND: `"${process.execPath}" "${resolve("dist/src/cli.js")}"` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /request is deprecated/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hooks.json matches Bash PreToolUse and docs cover install, opt-out, and limits", async () => {
  const hooks = JSON.parse(await readFile(resolve("integrations/claude-code/hooks.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
  };
  const [entry] = hooks.hooks.PreToolUse;
  assert.equal(entry!.matcher, "Bash");
  assert.match(entry!.hooks[0]!.command, /pre-install-guard\.mjs/);

  const script = await readFile(resolve("integrations/claude-code/pre-install-guard.mjs"), "utf8");
  const { version } = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  assert.match(script, new RegExp(`evergreen-deprecation@${version.replace(/\./g, "\\.")}`));

  const docs = await readFile(resolve("docs/HOOKS.md"), "utf8");
  assert.match(docs, /Claude Code/);
  assert.match(docs, /PreToolUse/);
  assert.match(docs, /EVERGREEN_SKIP=1/);
  assert.match(docs, /disableAllHooks/);
  assert.match(docs, /pre-install-guard\.mjs/);
  assert.match(docs, /first run may download/);
  assert.match(docs, /scan itself stay offline/);
  assert.match(docs, /timeout fails open/);
  assert.match(docs, /best-effort guardrail, not a security boundary/);
  assert.match(docs, /bash -c/);
});
