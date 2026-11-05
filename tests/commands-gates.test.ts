import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import type { Gated } from "../src/commands/runtime.js";
import { EXIT_CODES, createCommandContext, prepare, sharedGates } from "../src/commands/runtime.js";
import type { CommandContext, FailureClass } from "../src/commands/types.js";

const temporaryRoots: string[] = [];
/** A project directory with nothing in it, so `prepare` loads no config and pins no data version. */
let empty: string;

before(async () => {
  empty = await mkdtemp(join(tmpdir(), "evergreen-gates-"));
  temporaryRoots.push(empty);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface GateFailure {
  readonly kind: FailureClass;
  readonly message: string;
  readonly appendix: string;
}

/** A context that records failures instead of printing them, so a test can read the exact message. */
function recorder(): { ctx: CommandContext; failures: GateFailure[] } {
  const failures: GateFailure[] = [];
  const base = createCommandContext([], "help");
  const ctx: CommandContext = {
    ...base,
    fail(kind, message, appendix = "") {
      failures.push({ kind, message, appendix });
      return EXIT_CODES[kind];
    },
  };
  return { ctx, failures };
}

/** Runs the real option parsing and then the shared gates, and returns every failure they answered with. */
async function gate(...args: string[]): Promise<GateFailure[]> {
  const { ctx, failures } = recorder();
  const prepared = await prepare(args[0] ?? "scan", args.slice(1), ctx);
  if (typeof prepared === "number") throw new Error(`prepare failed with exit code ${prepared}`);
  const gated = await sharedGates(prepared, ctx);
  if (typeof gated === "number" && failures.length === 0) {
    throw new Error(`sharedGates returned exit code ${gated} without a failure`);
  }
  return failures;
}

/** The state the gates hand on, for the cases where every gate passes. */
async function passed(...args: string[]): Promise<Gated> {
  const { ctx, failures } = recorder();
  const prepared = await prepare(args[0] ?? "scan", args.slice(1), ctx);
  if (typeof prepared === "number") throw new Error(`prepare failed with exit code ${prepared}`);
  const gated = await sharedGates(prepared, ctx);
  if (typeof gated === "number") throw new Error(`sharedGates rejected: ${failures[0]?.message}`);
  return gated;
}

/** The message the first rejecting gate answers with, or `undefined` when every gate passes. */
async function rejection(...args: string[]): Promise<string | undefined> {
  return (await gate(...args))[0]?.message;
}

test("every format Evergreen renders passes, and anything else is a usage error naming the list", async () => {
  for (const format of [
    "text",
    "json",
    "markdown",
    "junit",
    "sarif",
    "rdjson",
    "codequality",
    "compact",
    "html",
    "slack",
    "teams",
    "webhook",
    "mermaid",
  ]) {
    assert.deepEqual(await gate("scan", empty, "--format", format), [], format);
  }
  const message = await rejection("scan", empty, "--format", "toml");
  assert.equal(
    message,
    "Unknown format: toml (expected text, json, markdown, junit, sarif, rdjson, codequality, compact, html, slack, teams, webhook, or mermaid).",
  );
  // A trailing --format with no value is still an unknown format, with the empty name printed.
  assert.match((await rejection("scan", empty, "--format")) ?? "", /^Unknown format: {2}\(expected/);
});

test("the commands with a narrow format set reject the others by name", async () => {
  assert.deepEqual(await gate("check", empty, "--format", "json"), []);
  assert.deepEqual(await gate("check", empty, "--format", "text"), []);
  assert.equal(
    await rejection("check", empty, "--format", "markdown"),
    "check supports --json and --format text|json only.",
  );
  assert.equal(
    await rejection("check-snippet", empty, "--format", "markdown"),
    "check-snippet supports --json and --format text|json only.",
  );
  assert.deepEqual(await gate("receipt", empty, "--format", "markdown"), []);
  assert.deepEqual(await gate("receipt", empty, "--format", "json"), []);
  assert.equal(await rejection("receipt", empty, "--format", "text"), "receipt supports --format markdown|json only.");
});

test("the scan-only formats reject other commands, with html also allowed for rollup", async () => {
  for (const format of [
    "markdown",
    "junit",
    "sarif",
    "rdjson",
    "codequality",
    "compact",
    "slack",
    "teams",
    "webhook",
  ]) {
    assert.equal(
      await rejection("forecast", empty, "--format", format),
      `--format ${format} is only available for the scan command.`,
      format,
    );
  }
  assert.equal(await rejection("receipt", empty, "--format", "html"), "receipt supports --format markdown|json only.");
  assert.deepEqual(await gate("rollup", empty, "--format", "html"), []);
  assert.deepEqual(await gate("scan", empty, "--format", "html"), []);
  // Mermaid answers for scan and forecast only, and the other scan-only list never sees it.
  assert.deepEqual(await gate("forecast", empty, "--format", "mermaid", "--months", "6"), []);
  assert.deepEqual(await gate("scan", empty, "--format", "mermaid"), []);
  assert.equal(
    await rejection("rollup", empty, "--format", "mermaid"),
    "--format mermaid is only available for the scan and forecast commands.",
  );
});

test("the scan-only flags each name themselves, and pass on the scan command", async () => {
  assert.equal(await rejection("scan", empty, "--demo"), undefined);
  assert.equal(await rejection("explain", empty, "--demo"), "--demo is only available for the scan command.");
  assert.deepEqual(await gate("scan", empty, "--write-status", "x"), []);
  assert.equal(
    await rejection("explain", empty, "--write-status"),
    "--write-status is only available for the scan command.",
  );
  assert.deepEqual(await gate("scan", empty, "--no-cache"), []);
  assert.equal(await rejection("explain", empty, "--no-cache"), "--no-cache is only available for the scan command.");
  assert.equal(
    await rejection("explain", empty, "--only", "npm"),
    "--only and --exclude are only available for the scan command.",
  );
  assert.equal(
    await rejection("explain", empty, "--exclude", "npm"),
    "--only and --exclude are only available for the scan command.",
  );
});

test("--json and --format json turn on JSON output, and --no-cache also reads its environment variable", async () => {
  assert.equal((await passed("scan", empty, "--json")).json, true);
  assert.equal((await passed("scan", empty, "--format", "json")).json, true);
  assert.equal((await passed("scan", empty)).json, false);
  assert.equal((await passed("scan", empty)).noCache, false);
  assert.equal((await passed("scan", empty, "--no-cache")).noCache, true);
  process.env.EVERGREEN_NO_CACHE = "1";
  try {
    assert.equal((await passed("scan", empty)).noCache, true);
  } finally {
    delete process.env.EVERGREEN_NO_CACHE;
  }
  assert.deepEqual((await passed("scan", empty)).selection, undefined);
});

test("a selector the registry knows becomes a selection, and one it does not lists the valid values", async () => {
  const gated = await passed("scan", empty, "--only", "npm", "--exclude", "github-actions");
  assert.deepEqual(gated.selection, { only: ["npm"], exclude: ["github-actions"] });

  const failures = await gate("scan", empty, "--only", "not-an-ecosystem");
  assert.equal(failures[0]?.kind, "usage");
  assert.match(failures[0]?.message ?? "", /^Unknown selector: not-an-ecosystem\./);
  assert.match(failures[0]?.appendix ?? "", /npm/);
  assert.equal(
    (await gate("scan", empty, "--only", ""))[0]?.message,
    "Unknown selector: . Use an ecosystem or a rule-id prefix (for example npm.package.request).",
  );
  assert.match((await gate("scan", empty, "--exclude", "-npm"))[0]?.message ?? "", /^Unknown selector: -npm\./);
  // One bad value among good ones reports only the bad one, and duplicates appear once.
  assert.equal(
    (await gate("scan", empty, "--only", "npm", "--only", "npm", "--only", "bogus"))[0]?.message,
    "Unknown selector: bogus. Use an ecosystem or a rule-id prefix (for example npm.package.request).",
  );
});

test("a format or command named like an Object.prototype property is a usage error, not a crash", async () => {
  for (const format of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    for (const command of ["check", "scan", "receipt", "forecast"]) {
      const failures = await gate(command, empty, "--format", format);
      assert.equal(failures.length, 1, `${command} --format ${format}`);
      assert.equal(failures[0]?.kind, "usage", `${command} --format ${format}`);
      assert.ok(failures[0]?.message.startsWith("Unknown format:"), `${command} --format ${format}`);
    }
  }
});
