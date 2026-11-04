import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import type { CommandContext, FailureClass } from "../src/commands/types.js";
import { EXIT_CODES } from "../src/commands/types.js";
import { prepare, repositoryPhase, sharedGates } from "../src/commands/runtime.js";
import type { Gated, Prepared } from "../src/commands/runtime.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(name: string, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(root);
  for (const [file, contents] of Object.entries(files)) await writeFile(join(root, file), contents);
  return root;
}

const nodeProject = () => repository("runtime", { "package.json": '{"engines":{"node":"18"}}' });

interface CapturedContext extends CommandContext {
  readonly failures: string[];
}

/** A context that records the class and message of every failure instead of writing to the terminal. */
function context(): CapturedContext {
  const failures: string[] = [];
  return {
    jsonErrors: false,
    debug: false,
    help: "help text",
    exitCodes: EXIT_CODES,
    failures,
    fail(kind: FailureClass, message: string, appendix = "") {
      failures.push(`${kind}: ${message}${appendix}`);
      return EXIT_CODES[kind];
    },
    failActionable(kind: FailureClass, actionable) {
      failures.push(`${kind}: ${actionable.cause}`);
      return EXIT_CODES[kind];
    },
  };
}

/** Prepares and gates a command, failing the test when either step returns an exit code. */
async function gated(command: string, args: string[]): Promise<Gated> {
  const prepared = await prepare(command, args, context());
  if (typeof prepared === "number") assert.fail(`prepare(${command}) failed with ${prepared}`);
  const state = await sharedGates(prepared, context());
  if (typeof state === "number") assert.fail(`sharedGates(${command}) failed with ${state}`);
  return state;
}

const isPrepared = (value: Prepared | number): value is Prepared => typeof value !== "number";

test("prepare: option parsing, positional words, and the path argument", async () => {
  const root = await nodeProject();
  const ctx = context();
  const prepared = await prepare("scan", [root, "--json", "--no-cache", "--ignore", "a", "--ignore", "b"], ctx);
  assert.ok(isPrepared(prepared));
  assert.equal(prepared.command, "scan");
  assert.deepEqual(prepared.args, ["scan", root, "--json", "--no-cache", "--ignore", "a", "--ignore", "b"]);
  assert.deepEqual(prepared.positional, [root]);
  assert.equal(prepared.pathArgument, root);
  assert.equal(prepared.demo, false);
  assert.equal(prepared.findingId, undefined);
  assert.equal(prepared.format, undefined);
  assert.equal(prepared.formatIndex, -1);
  assert.equal(prepared.dataVersionFlag, undefined);
  assert.equal(prepared.dataVersionIndex, -1);
  assert.equal(prepared.optionValue("--json"), "--no-cache", "optionValue is positional, like the CLI's parsing");
  assert.equal(prepared.optionValue("--missing"), undefined);
  assert.deepEqual(prepared.optionValues("--ignore"), ["a", "b"]);
  assert.deepEqual(prepared.optionValues("--missing"), []);
  assert.deepEqual(ctx.failures, []);
});

test("prepare: a value option swallows its value and --demo is remembered", async () => {
  const root = await nodeProject();
  const prepared = await prepare("scan", [root, "--fail-on", "high", "--baseline", "b.json", "--demo"], context());
  assert.ok(isPrepared(prepared));
  assert.deepEqual(prepared.positional, [root]);
  assert.equal(prepared.demo, true);
  assert.equal(prepared.optionValue("--fail-on"), "high");
});

test("prepare: the finding-id commands take the id and keep the path second", async () => {
  const root = await nodeProject();
  for (const command of ["explain", "context", "report-issue"]) {
    const prepared = await prepare(command, ["abc-123", root], context());
    assert.ok(isPrepared(prepared), command);
    assert.equal(prepared.findingId, "abc-123", command);
    assert.equal(prepared.pathArgument, root, command);
  }
  const missingPath = await prepare("explain", ["abc-123"], context());
  assert.ok(isPrepared(missingPath));
  assert.equal(missingPath.pathArgument, ".");

  const check = await prepare("check", [".", "--json"], context());
  assert.ok(isPrepared(check));
  assert.equal(check.pathArgument, ".", "check always scans the working directory");
  assert.equal(check.findingId, undefined);
});

test("prepare: --data-version needs a value and a pin that cannot load fails", async () => {
  const root = await nodeProject();
  const ctx = context();
  assert.equal(await prepare("scan", [root, "--data-version"], ctx), EXIT_CODES.usage);
  assert.match(ctx.failures.join("\n"), /--data-version needs a version/);

  const trailingFlag = context();
  assert.equal(await prepare("scan", [root, "--data-version", "--json"], trailingFlag), EXIT_CODES.usage);

  const unpinnable = context();
  const code = await prepare("scan", [root, "--data-version", "not-a-version"], unpinnable);
  assert.equal(code, EXIT_CODES.usage, unpinnable.failures.join("\n"));
  assert.match(unpinnable.failures.join("\n"), /not-a-version/);

  const unavailable = context();
  const pinned = await prepare("scan", [root, "--data-version", "2020.01.01"], unavailable);
  assert.equal(pinned, EXIT_CODES.data, unavailable.failures.join("\n"));
  assert.match(unavailable.failures.join("\n"), /2020\.01\.01/);

  const bundled = await prepare("scan", [root, "--data-version", "bundled"], context());
  assert.ok(isPrepared(bundled));
  assert.equal(bundled.dataVersionFlag, "bundled");
  assert.deepEqual(bundled.args.slice(bundled.dataVersionIndex), ["--data-version", "bundled"]);
});

test("prepare: a broken configuration file is a usage failure", async () => {
  const root = await repository("runtime-config", { ".evergreen.json": "{", "package.json": "{}" });
  const ctx = context();
  assert.equal(await prepare("scan", [root], ctx), EXIT_CODES.usage);
  assert.equal(ctx.failures.length, 1, ctx.failures.join("\n"));
});

test("prepare: the commands that read no configuration still prepare", async () => {
  const root = await nodeProject();
  const prepared = await prepare("capabilities", [], context());
  assert.ok(isPrepared(prepared));
  assert.equal(prepared.config, undefined);
  assert.equal(prepared.pathArgument, ".");

  const scanned = await prepare("scan", [root], context());
  assert.ok(isPrepared(scanned));
  assert.ok(scanned.config === undefined || typeof scanned.config === "object");
});

test("repositoryPhase: --all is a scan-only flag that needs a directory", async () => {
  const root = await nodeProject();
  for (const args of [["--all"], ["--all", "--json"], ["--all", "-x"]]) {
    const ctx = context();
    const state = await gated("scan", [root, ...args]);
    assert.equal(await repositoryPhase(state, ctx), EXIT_CODES.usage, args.join(" "));
    assert.match(ctx.failures.join("\n"), /--all needs a directory of repositories/);
  }
  const notScan = context();
  const planState = await gated("plan", ["--all", root]);
  assert.equal(await repositoryPhase(planState, notScan), EXIT_CODES.usage);
});

test("repositoryPhase: --demo refuses a path, --all, --baseline, and --write-status", async () => {
  const cases: Array<[string[], RegExp]> = [
    [["--demo", "."], /--demo does not take a path argument/],
    [["--demo", "--all", "."], /--all is not available with --demo/],
    [["--demo", "--baseline", "b.json"], /--baseline and --write-status are not available with --demo/],
    [["--demo", "--write-status"], /--baseline and --write-status are not available with --demo/],
  ];
  for (const [args, message] of cases) {
    const ctx = context();
    const state = await gated("scan", args);
    assert.equal(await repositoryPhase(state, ctx), EXIT_CODES.usage, args.join(" "));
    assert.match(ctx.failures.join("\n"), message);
  }
  const clean = await repositoryPhase(await gated("scan", ["--demo"]), context());
  assert.equal(clean, undefined, "--demo alone scans the built-in demo");
});

test("repositoryPhase: several paths scan together and print one document", async () => {
  const first = await nodeProject();
  const second = await repository("runtime-b", { "package.json": '{"engines":{"node":"20"}}' });
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    const state = await gated("scan", [first, second, "--json"]);
    assert.equal(await repositoryPhase(state, context()), 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  const document = JSON.parse(writes.join("")) as { schemaVersion: string; projects: unknown[]; total: unknown };
  assert.equal(document.schemaVersion, "evergreen.multi-scan.v1");
  assert.equal(document.projects.length, 2);
  assert.ok(document.total !== undefined);
});

test("repositoryPhase: several paths refuse a report format, a baseline, and an empty --all directory", async () => {
  const first = await nodeProject();
  const second = await nodeProject();
  const format = context();
  const formatState = await gated("scan", [first, second, "--format", "markdown"]);
  assert.equal(await repositoryPhase(formatState, format), EXIT_CODES.usage);
  assert.match(format.failures.join("\n"), /Scanning several paths supports --json and --format text\|json only/);

  const baseline = context();
  const baselineState = await gated("scan", [first, second, "--baseline", "b.json"]);
  assert.equal(await repositoryPhase(baselineState, baseline), EXIT_CODES.usage);
  assert.match(baseline.failures.join("\n"), /not available when scanning several paths/);

  const empty = await repository("runtime-empty-dir");
  const notFound = context();
  const emptyState = await gated("scan", ["--all", empty]);
  assert.equal(await repositoryPhase(emptyState, notFound), EXIT_CODES.usage);
  assert.match(notFound.failures.join("\n"), new RegExp(`No Git repositories found in ${escapeRegExp(empty)}`));

  const unreadable = context();
  const missingState = await gated("scan", ["--all", join(empty, "nope")]);
  assert.equal(await repositoryPhase(missingState, unreadable), EXIT_CODES.usage);
  assert.match(unreadable.failures.join("\n"), /Cannot read /);
});

test("repositoryPhase: a --all directory of repositories is found and scanned", async () => {
  const parent = await repository("runtime-all");
  const inside = join(parent, "widget");
  await mkdir(inside);
  await writeFile(join(inside, "package.json"), '{"engines":{"node":"18"}}');
  const { spawnSync } = await import("node:child_process");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: inside }).status, 0);
  const ctx = context();
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    const state = await gated("scan", ["--all", parent, "--json", "--only", "nodejs"]);
    assert.equal(await repositoryPhase(state, ctx), 0, ctx.failures.join("\n"));
  } finally {
    process.stdout.write = originalWrite;
  }
  const document = JSON.parse(writes.join("")) as {
    projects: Array<{ findings: number; result: { findings: unknown[] } }>;
    total: { projects: number; findings: number };
  };
  assert.equal(document.projects.length, 1);
  assert.equal(document.total.projects, 1);
  assert.equal(document.projects[0]?.result.findings.length, document.projects[0]?.findings);
});

test("repositoryPhase: a path that is not a directory fails actionably, a real one passes", async () => {
  const root = await nodeProject();
  const missing = context();
  const missingState = await gated("scan", [join(root, "does-not-exist")]);
  assert.equal(await repositoryPhase(missingState, missing), EXIT_CODES.usage);
  assert.equal(missing.failures.length, 1, missing.failures.join("\n"));

  assert.equal(await repositoryPhase(await gated("scan", [root]), context()), undefined);
});

/** Escapes a filesystem path for use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
