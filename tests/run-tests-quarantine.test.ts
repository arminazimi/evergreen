// Tests for the quarantine gate in tools/run-tests.mjs (issue #2084): a quarantined test file is
// skipped only until its required expiry date, and every run fails loudly once that date has passed.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";

const RUNNER_SOURCE = resolve("tools/run-tests.mjs");
const ISSUER = "https://github.com/arminazimi/evergreen/issues";
const DUMMY = "dist/tests/dummy.test.js";
const DUMMY_SOURCE =
  'import assert from "node:assert/strict";\nimport { test } from "node:test";\n\ntest("dummy passes", () => {\n  assert.equal(1, 1);\n});\n';

type QuarantineEntry = { file: string; issue: string; expires: string };

/** The CI knobs the runner reads; a spawned runner starts with none of them set. */
const RUNNER_ENV_KEYS = [
  "CI",
  "EVERGREEN_CHECK_COVERAGE",
  "EVERGREEN_RETRY_FLAKY",
  "EVERGREEN_TEST_SHARD",
  "EVERGREEN_TEST_SHARD_COUNT",
  "GITHUB_EVENT_NAME",
  "GITHUB_STEP_SUMMARY",
  // Node marks the process running a test file with these; an inherited marker would send the
  // spawned suite's results over the outer run's reporting channel instead of its stdout.
  "NODE_TEST_CONTEXT",
  "NODE_TEST_REPORTING_ENDPOINT",
];

/** Everything the runner exports that these tests call; it is plain JS, so TypeScript cannot see it. */
type RunnerModule = {
  currentIsoDate: () => string;
  expiredQuarantineEntries: (entries: QuarantineEntry[], today?: string) => QuarantineEntry[];
  isIsoDate: (value: unknown) => boolean;
  parseQuarantine: (text: string) => QuarantineEntry[];
  quarantinedEntriesInRun: (files: string[], entries: QuarantineEntry[], root?: string) => QuarantineEntry[];
  renderQuarantineExpiryFailure: (expired: QuarantineEntry[]) => string;
  renderQuarantineList: (entries: QuarantineEntry[], headline: string) => string;
};

async function runnerModule(): Promise<RunnerModule> {
  return import(pathToFileURL(RUNNER_SOURCE).href);
}

function runnerEnv(event: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of RUNNER_ENV_KEYS) delete env[key];
  if (event) env.GITHUB_EVENT_NAME = event;
  return env;
}

function quarantineText(entries: QuarantineEntry[]): string {
  return `${JSON.stringify({ quarantined: entries }, null, 2)}\n`;
}

const tempRoots: string[] = [];

/**
 * A throwaway repository: a copy of the runner, symlinks to the real build output it imports (so its
 * time budget and pipeline flags resolve), one passing test file, and the quarantine JSON under test.
 * `dist/tests` stays a real directory of this fixture, so the suite glob finds exactly that one file.
 */
async function fakeRepo(text: string): Promise<string> {
  const created = await mkdtemp(join(tmpdir(), "evergreen-quarantine-expiry-"));
  // macOS hands out /var/... through a symlink and the runner compares realpaths; work in the target.
  const root = await realpath(created);
  tempRoots.push(root);
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "tests"), { recursive: true });
  await mkdir(join(root, "dist", "tests"), { recursive: true });
  await writeFile(join(root, "tools", "run-tests.mjs"), await readFile(RUNNER_SOURCE, "utf8"));
  await writeFile(join(root, "tests", "quarantine.json"), text);
  await writeFile(join(root, DUMMY), DUMMY_SOURCE);
  for (const name of await readdir(resolve("dist"))) {
    if (name === "tests") continue;
    await symlink(join(resolve("dist"), name), join(root, "dist", name));
  }
  await symlink(resolve("benchmarks"), join(root, "benchmarks"));
  return root;
}

function runRunner(root: string, event = ""): { code: number; out: string; err: string } {
  const result = spawnSync(process.execPath, [join(root, "tools", "run-tests.mjs")], {
    cwd: root,
    env: runnerEnv(event),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: result.status ?? 1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

after(async () => {
  for (const root of tempRoots) await rm(root, { recursive: true, force: true });
});

test("isIsoDate accepts real days and rejects invented ones", async () => {
  const { isIsoDate } = await runnerModule();
  assert.equal(isIsoDate("2026-11-04"), true);
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-02-30"), false, "a day that does not exist");
  assert.equal(isIsoDate("2025-02-29"), false, "a leap day in a common year");
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-1-4"), false, "needs the padded ISO form");
  assert.equal(isIsoDate("2026-11-04T00:00:00Z"), false, "no time part");
  assert.equal(isIsoDate("2026-11-04 "), false, "no surrounding whitespace");
  assert.equal(isIsoDate(undefined), false);
  assert.equal(isIsoDate(11), false);
});

test("currentIsoDate is the UTC day, so expiry reads the same on every platform", async () => {
  const { currentIsoDate, isIsoDate } = await runnerModule();
  assert.equal(isIsoDate(currentIsoDate()), true);
  assert.equal(currentIsoDate(), new Date().toISOString().slice(0, 10));
});

test("a quarantine entry without an expiry date is rejected", async () => {
  const { parseQuarantine } = await runnerModule();
  const legacy = JSON.stringify({ quarantined: [{ file: "tests/a.test.ts", issue: `${ISSUER}/1234` }] });
  assert.throws(
    () => parseQuarantine(legacy),
    /tests\/quarantine\.json\[0\]\.expires is required and must be an ISO date \(YYYY-MM-DD\)/,
  );
});

test("a quarantine entry with a missing or invented expiry day is rejected", async () => {
  const { parseQuarantine } = await runnerModule();
  for (const expires of ["2026-02-30", "tomorrow", "", 20261104, null]) {
    const text = JSON.stringify({
      quarantined: [{ file: "tests/a.test.ts", issue: `${ISSUER}/1234`, expires }],
    });
    assert.throws(
      () => parseQuarantine(text),
      /tests\/quarantine\.json\[0\]\.expires is required/,
      `expires ${JSON.stringify(expires)} must not parse`,
    );
  }
});

test("a quarantine entry keeps its expiry date and a forward-slash file path", async () => {
  const { parseQuarantine } = await runnerModule();
  assert.deepEqual(
    parseQuarantine(
      quarantineText([
        { file: "tests\\sub\\a.test.ts", issue: `${ISSUER}/1234`, expires: "2026-11-30" },
        { file: "dist/tests/b.test.js", issue: `${ISSUER}/98765`, expires: "2027-01-26" },
      ]),
    ),
    [
      { file: "tests/sub/a.test.ts", issue: `${ISSUER}/1234`, expires: "2026-11-30" },
      { file: "dist/tests/b.test.js", issue: `${ISSUER}/98765`, expires: "2027-01-26" },
    ],
  );
});

test("an entry is in force on its expiry date and expired the day after", async () => {
  const { expiredQuarantineEntries } = await runnerModule();
  const entry = { file: "tests/a.test.ts", issue: `${ISSUER}/1234`, expires: "2026-11-04" };
  assert.deepEqual(expiredQuarantineEntries([entry], "2026-11-03"), []);
  assert.deepEqual(expiredQuarantineEntries([entry], "2026-11-04"), []);
  assert.deepEqual(expiredQuarantineEntries([entry], "2026-11-05"), [entry]);
});

test("expired entries are listed oldest expiry first, then by file", async () => {
  const { expiredQuarantineEntries } = await runnerModule();
  const entries = [
    { file: "tests/z-newer.test.ts", issue: `${ISSUER}/1`, expires: "2026-05-01" },
    { file: "tests/a-oldest.test.ts", issue: `${ISSUER}/2`, expires: "2026-01-01" },
    { file: "tests/b-tie.test.ts", issue: `${ISSUER}/3`, expires: "2026-05-01" },
    { file: "a-tie.test.ts", issue: `${ISSUER}/4`, expires: "2026-05-01" },
    { file: "tests/fine.test.ts", issue: `${ISSUER}/5`, expires: "2999-12-31" },
  ];
  assert.deepEqual(
    expiredQuarantineEntries(entries, "2026-11-04").map((expired) => expired.file),
    ["tests/a-oldest.test.ts", "a-tie.test.ts", "tests/b-tie.test.ts", "tests/z-newer.test.ts"],
  );
});

test("expiry needs a real day to compare against", async () => {
  const { expiredQuarantineEntries } = await runnerModule();
  const entries = [{ file: "tests/a.test.ts", issue: `${ISSUER}/1`, expires: "2026-11-04" }];
  assert.throws(() => expiredQuarantineEntries(entries, "2026-11-04T12:00:00Z"), /ISO date/);
  assert.throws(() => expiredQuarantineEntries(entries, undefined), /ISO date/);
});

test("the expiry failure names the file, the date, and the issue link", async () => {
  const { renderQuarantineExpiryFailure } = await runnerModule();
  const text = renderQuarantineExpiryFailure([
    { file: "tests/a.test.ts", issue: `${ISSUER}/1234`, expires: "2026-01-01" },
    { file: "dist/tests/b.test.js", issue: `${ISSUER}/5678`, expires: "2026-02-01" },
  ]);
  assert.match(text, /Quarantine expired \(tests\/quarantine\.json\)/);
  assert.match(text, /tests\/a\.test\.ts expired on 2026-01-01 .*issues\/1234/);
  assert.match(text, /dist\/tests\/b\.test\.js expired on 2026-02-01 .*issues\/5678/);
  assert.match(text, /Fix the file and delete its entry/);
  assert.match(text, /Do not add another entry, a skip, or a filter to hide the failure/);
});

test("the skip report names every quarantined file with its expiry and issue", async () => {
  const { renderQuarantineList } = await runnerModule();
  assert.deepEqual(
    renderQuarantineList(
      [
        { file: "tests/z.test.ts", issue: `${ISSUER}/2`, expires: "2026-12-08" },
        { file: "tests/a.test.ts", issue: `${ISSUER}/1`, expires: "2026-12-01" },
      ],
      "Skipping 2 quarantined test file(s) on pull_request:",
    ).split("\n"),
    [
      "Skipping 2 quarantined test file(s) on pull_request:",
      "  - tests/a.test.ts until 2026-12-01 — https://github.com/arminazimi/evergreen/issues/1",
      "  - tests/z.test.ts until 2026-12-08 — https://github.com/arminazimi/evergreen/issues/2",
      "",
    ],
  );
});

test("only entries naming a file this run would execute count as skipped", async () => {
  const { quarantinedEntriesInRun } = await runnerModule();
  const root = resolve("fake-root");
  assert.deepEqual(
    quarantinedEntriesInRun(
      [
        join(root, "dist/tests/in-run.test.js"),
        join(root, DUMMY),
        join(root, "dist/tests/other.test.js"),
      ],
      [
        { file: "tests/in-run.test.ts", issue: `${ISSUER}/1`, expires: "2026-12-01" },
        { file: DUMMY, issue: `${ISSUER}/2`, expires: "2026-12-01" },
        { file: "tests/not-built.test.ts", issue: `${ISSUER}/3`, expires: "2026-12-01" },
      ],
      root,
    ).map((entry) => entry.file),
    ["tests/in-run.test.ts", DUMMY],
  );
});

test("the committed quarantine parses and holds no expired entry", async () => {
  const { parseQuarantine, expiredQuarantineEntries, currentIsoDate } = await runnerModule();
  const entries = parseQuarantine(await readFile(resolve("tests/quarantine.json"), "utf8"));
  assert.deepEqual(expiredQuarantineEntries(entries, currentIsoDate()), []);
});

test("an expired entry fails the run with its issue link, whatever the event", async () => {
  const root = await fakeRepo(
    quarantineText([{ file: DUMMY, issue: `${ISSUER}/2084`, expires: "2000-01-01" }]),
  );
  for (const event of ["", "pull_request", "merge_group", "schedule"]) {
    const run = runRunner(root, event);
    assert.equal(run.code, 1, `event ${JSON.stringify(event)}: ${run.out}${run.err}`);
    assert.match(run.err, /Quarantine expired \(tests\/quarantine\.json\)/);
    assert.match(run.err, /dist\/tests\/dummy\.test\.js expired on 2000-01-01/);
    assert.match(run.err, /https:\/\/github\.com\/arminazimi\/evergreen\/issues\/2084/);
    // Failing on the gate is the whole output: the suite neither ran nor skipped quietly.
    assert.doesNotMatch(run.out, /dummy passes/);
  }
});

test("an expired entry also fails the nightly quarantined run", async () => {
  const root = await fakeRepo(
    quarantineText([{ file: DUMMY, issue: `${ISSUER}/2084`, expires: "2000-01-01" }]),
  );
  const result = spawnSync(process.execPath, [join(root, "tools", "run-tests.mjs"), "--quarantine-only"], {
    cwd: root,
    env: runnerEnv("schedule"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const err = result.stderr ?? "";
  assert.equal(result.status ?? 1, 1, err);
  assert.match(err, /Quarantine expired/);
  assert.match(err, /issues\/2084/);
});

test("an entry in force skips only pull request events and names what it skipped", async () => {
  const root = await fakeRepo(
    quarantineText([{ file: DUMMY, issue: `${ISSUER}/2084`, expires: "2999-12-31" }]),
  );

  const pullRequest = runRunner(root, "pull_request");
  assert.equal(pullRequest.code, 0, `${pullRequest.out}${pullRequest.err}`);
  assert.match(pullRequest.out, /Skipping 1 quarantined test file\(s\) on pull_request/);
  assert.match(pullRequest.out, /- dist\/tests\/dummy\.test\.js until 2999-12-31 — /);
  assert.match(pullRequest.out, /https:\/\/github\.com\/arminazimi\/evergreen\/issues\/2084/);
  assert.doesNotMatch(pullRequest.out, /dummy passes/, "a quarantined file stays skipped on a pull request");

  const push = runRunner(root, "push");
  assert.equal(push.code, 0, `${push.out}${push.err}`);
  assert.match(push.out, /dummy passes/, "outside a pull request the quarantined file still runs");
});

test("an empty quarantine runs every file and prints no skip list", async () => {
  const root = await fakeRepo(quarantineText([]));
  const run = runRunner(root, "pull_request");
  assert.equal(run.code, 0, `${run.out}${run.err}`);
  assert.doesNotMatch(run.out, /Skipping \d+ quarantined/);
  assert.match(run.out, /dummy passes/);
});
