import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";
import { join } from "node:path";
import { after, test } from "node:test";

import { EXIT_CODES, createCommandContext } from "../src/commands/runtime.js";
import { command, reportOrRethrow } from "../src/commands/watch.js";
import type { CommandContext, FailureClass } from "../src/commands/types.js";
import { renderActionable } from "../src/errors.js";
import { watchStateFile } from "../src/watch.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A machine whose watch list is empty, and the projects a test can register in it. */
async function machine(): Promise<string> {
  const home = await mkdtemp(join(os.tmpdir(), "evergreen-watch-command-"));
  temporaryRoots.push(home);
  await mkdir(join(home, ".config"), { recursive: true });
  return home;
}

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly failures: Array<{ kind: FailureClass; message: string }>;
}

const USAGE = "Usage: evergreen watch add|remove <path> | list [--json] | [run] [--weekly] [--json]";

/**
 * Runs the shipping `watch` handler in this process against one home directory, so a test can follow a
 * register, list, and digest sequence the way a user does.
 */
async function watchIn(home: string, ...args: string[]): Promise<Run> {
  const failures: Run["failures"] = [];
  const base = createCommandContext(["watch", ...args], "help");
  const ctx: CommandContext = {
    ...base,
    fail(kind, message) {
      failures.push({ kind, message });
      return EXIT_CODES[kind];
    },
    failActionable(kind, actionable) {
      const rendered = renderActionable(actionable);
      return ctx.fail(kind, rendered.message, rendered.appendix);
    },
  };
  const original = {
    stdout: process.stdout.write,
    stderr: process.stderr.write,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  };
  let stdout = "";
  let stderr = "";
  const collect =
    (append: (text: string) => void) =>
    (chunk: unknown): boolean => {
      if (typeof chunk === "string") append(chunk);
      return true;
    };
  process.stdout.write = collect((text) => {
    stdout += text;
  }) as typeof process.stdout.write;
  process.stderr.write = collect((text) => {
    stderr += text;
  }) as typeof process.stderr.write;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  try {
    const code = await command.run(args, ctx);
    return { code, stdout, stderr, failures };
  } finally {
    process.stdout.write = original.stdout;
    process.stderr.write = original.stderr;
    for (const key of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME"] as const) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("watch add registers a project, says so twice, and watch remove stops watching it", async () => {
  const home = await machine();
  const project = await machine();

  const added = await watchIn(home, "add", project);
  assert.equal(added.code, 0, added.failures[0]?.message);
  assert.equal(added.stdout, `Now watching ${project}\n`);

  const twice = await watchIn(home, "add", project);
  assert.equal(twice.code, 0, twice.failures[0]?.message);
  assert.equal(twice.stdout, `Already watching ${project}\n`);

  const removed = await watchIn(home, "remove", project);
  assert.equal(removed.code, 0, removed.failures[0]?.message);
  assert.equal(removed.stdout, `Stopped watching ${project}\n`);

  const gone = await watchIn(home, "remove", project);
  assert.equal(gone.code, 0, gone.failures[0]?.message);
  assert.equal(gone.stdout, `Was not watching ${project}\n`);
});

test("watch add and remove reject anything that is not exactly one path", async () => {
  const home = await machine();
  for (const args of [["add"], ["add", "one", "two"], ["add", "--json"], ["remove"], ["remove", "a", "b"]]) {
    const run = await watchIn(home, ...args);
    assert.equal(run.code, 2, args.join(" "));
    assert.deepEqual(run.failures, [{ kind: "usage", message: USAGE }], args.join(" "));
    assert.equal(run.stdout, "");
  }
});

test("watch list prints nothing watched, one project per line, or a JSON document", async () => {
  const home = await machine();
  const empty = await watchIn(home, "list");
  assert.equal(empty.code, 0, empty.failures[0]?.message);
  assert.equal(empty.stdout, "No projects are watched. Add one with `evergreen watch add <path>`.\n");

  const project = await machine();
  await watchIn(home, "add", project);
  const named = await watchIn(home, "list");
  assert.equal(named.stdout, `${project}\n`);

  const asJson = await watchIn(home, "list", "--json");
  assert.deepEqual(JSON.parse(asJson.stdout), { projects: [project] });

  const extra = await watchIn(home, "list", "surprise");
  assert.equal(extra.code, 2);
  assert.deepEqual(extra.failures, [{ kind: "usage", message: USAGE }]);
});

test("watch digests what is registered, once per week with --weekly, and as JSON with --json", async () => {
  const home = await machine();
  const project = await machine();
  await watchIn(home, "add", project);

  const first = await watchIn(home, "run", "--json");
  assert.equal(first.code, 0, first.failures[0]?.message);
  const digest = JSON.parse(first.stdout) as { schemaVersion: string; ran: boolean; projects: number };
  assert.equal(digest.schemaVersion, "evergreen.watch.v1");
  assert.equal(digest.ran, true);
  assert.equal(digest.projects, 1);

  // A weekly digest waits for the week to pass, so the run right after it scans nothing.
  const weekly = await watchIn(home, "run", "--weekly", "--json");
  assert.equal(weekly.code, 0, weekly.failures[0]?.message);
  assert.equal(JSON.parse(weekly.stdout).ran, false);

  // The text digest prints, and `run` is the default subcommand.
  const text = await watchIn(home, "run");
  assert.equal(text.code, 0, text.failures[0]?.message);
  assert.notEqual(text.stdout, "");
  const bare = await watchIn(home);
  assert.equal(bare.code, 0, bare.failures[0]?.message);
});

test("watch reads --format json as the JSON flag, skipping its value when it looks for the subcommand", async () => {
  const home = await machine();
  const project = await machine();
  await watchIn(home, "add", project);

  const viaFormat = await watchIn(home, "--format", "json", "list");
  const viaFlag = await watchIn(home, "list", "--json");
  assert.equal(viaFormat.code, 0, viaFormat.failures[0]?.message);
  assert.equal(viaFormat.stdout, viaFlag.stdout);
  assert.deepEqual(JSON.parse(viaFormat.stdout), { projects: [project] });
});

test("watch with only --json runs the digest, because run is the default subcommand", async () => {
  const home = await machine();
  const project = await machine();
  await watchIn(home, "add", project);

  const implicit = await watchIn(home, "--json");
  const explicit = await watchIn(home, "run", "--json");
  assert.equal(implicit.code, 0, implicit.failures[0]?.message);
  assert.deepEqual(JSON.parse(implicit.stdout), JSON.parse(explicit.stdout));
});

test("a runtime error becomes a parse failure, and a programming error propagates", () => {
  const failures: Run["failures"] = [];
  const base = createCommandContext(["watch", "list"], "help");
  const ctx: CommandContext = {
    ...base,
    fail(kind, message) {
      failures.push({ kind, message });
      return EXIT_CODES[kind];
    },
  };
  assert.equal(reportOrRethrow(new Error("state unreadable"), ctx), EXIT_CODES.parse);
  assert.deepEqual(failures, [{ kind: "parse", message: "state unreadable" }]);
  assert.throws(() => reportOrRethrow(new TypeError("bad shape"), ctx), TypeError);
  assert.throws(
    () => reportOrRethrow("not an error", ctx),
    (thrown: unknown) => thrown === "not an error",
  );
  assert.equal(failures.length, 1);
});

test("watch answers a usage error for a subcommand it does not know and a flag it does not take", async () => {
  const home = await machine();
  for (const args of [["browse"], ["run", "--monthly"], ["add", "path", "--weekly"]]) {
    const run = await watchIn(home, ...args);
    assert.equal(run.code, 2, args.join(" "));
    assert.deepEqual(run.failures, [{ kind: "usage", message: USAGE }], args.join(" "));
  }
});

test("a watch list that is not readable fails as a parse error instead of crashing", async () => {
  const home = await machine();
  await watchIn(home, "list");
  const file = watchStateFile({ HOME: home, XDG_CONFIG_HOME: join(home, ".config") });
  await mkdir(join(home, ".config", "evergreen"), { recursive: true });
  await writeFile(file, "{ this is not json");
  const broken = await watchIn(home, "list");
  assert.equal(broken.code, 4);
  assert.deepEqual(
    broken.failures.map((failure) => failure.kind),
    ["parse"],
  );
  assert.match(broken.failures[0]?.message ?? "", /is not readable/);
});

test("watch answers a usage error for prototype property names, not a value from Object.prototype", async () => {
  const home = await machine();
  for (const subcommand of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    const run = await watchIn(home, subcommand);
    assert.equal(run.code, 2, subcommand);
    assert.equal(typeof run.code, "number", subcommand);
    assert.deepEqual(run.failures, [{ kind: "usage", message: USAGE }], subcommand);
    assert.equal(run.stdout, "", subcommand);
  }
});
