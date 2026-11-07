import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildResult, standing } from "../benchmarks/comparison/dependabot/aggregate.js";
import { main as build } from "../benchmarks/comparison/dependabot/build.js";
import {
  directoryMatches,
  normalizeDirectory,
  parseDependabotConfig,
} from "../benchmarks/comparison/dependabot/config.js";
import { renderJson, renderMarkdown } from "../benchmarks/comparison/dependabot/report.js";
import { RAW_SCHEMA_VERSION, type RawRecord } from "../benchmarks/comparison/dependabot/types.js";

function record(overrides: Partial<RawRecord> & Pick<RawRecord, "repository">): RawRecord {
  return {
    schemaVersion: RAW_SCHEMA_VERSION,
    commit: "a".repeat(40),
    ecosystem: "npm",
    selection: "blind",
    continuity: false,
    evergreen: {
      version: "0.7.3",
      commit: "b".repeat(40),
      durationMs: 10,
      findings: [
        {
          ruleId: "npm.package.left-pad.deprecated",
          path: "package.json",
          dependabot: { packageEcosystem: "npm", directory: "/" },
        },
        {
          ruleId: "npm.package.jade.deprecated",
          path: "apps/web/package.json",
          dependabot: { packageEcosystem: "npm", directory: "/apps/web" },
        },
        { ruleId: "nodejs.runtime.eol-18", path: ".nvmrc", dependabot: null },
      ],
    },
    dependabot: { run: "not-run", entries: [] },
    ...overrides,
  };
}

test("a committed config is read into one entry per declared directory", () => {
  const entries = parseDependabotConfig(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /apps/web
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directories:
      - "/"
      - "/.github/actions/*"
    ignore:
      - dependency-name: actions/checkout
  - directory: /
`);
  assert.deepEqual(entries, [
    { packageEcosystem: "npm", directory: "/apps/web", ignore: false, allow: false },
    { packageEcosystem: "github-actions", directory: "/", ignore: true, allow: false },
    { packageEcosystem: "github-actions", directory: "/.github/actions/*", ignore: true, allow: false },
  ]);
});

test("a malformed config throws instead of reporting an empty surface", () => {
  assert.throws(() => parseDependabotConfig("- just\n- a list\n"), /not a mapping/);
  assert.throws(() => parseDependabotConfig("updates: nope\n"), /not a list/);
  assert.deepEqual(parseDependabotConfig("version: 2\n"), []);
});

test("directory matching normalizes roots and implements single and repeated wildcards", () => {
  assert.equal(normalizeDirectory("apps/web/"), "/apps/web");
  assert.equal(normalizeDirectory(""), "/");
  assert.equal(directoryMatches("/apps/web", "/apps/web/"), true);
  assert.equal(directoryMatches("apps/web", "/apps/web"), true);
  assert.equal(directoryMatches("/", "/"), true);
  assert.equal(directoryMatches("/*", "/apps"), true);
  assert.equal(directoryMatches("/*", "/apps/web"), false);
  assert.equal(directoryMatches("/**", "/apps/web"), true);
  assert.equal(directoryMatches("/.github/actions/*", "/.github/actions/checkout"), true);
  assert.equal(directoryMatches("/.github/actions/*", "/.github/actions/checkout/nested"), false);
  assert.equal(directoryMatches("/apps/?", "/apps/a"), true);
});

test("a finding stands against the declared surface as covered, uncovered, filtered, or unmodeled", () => {
  const cases = [
    [
      "covered",
      { packageEcosystem: "npm", directory: "/" },
      [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }],
    ],
    [
      "uncovered",
      { packageEcosystem: "npm", directory: "/apps/web" },
      [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }],
    ],
    [
      "filtered",
      { packageEcosystem: "npm", directory: "/" },
      [{ packageEcosystem: "npm", directory: "/", ignore: true, allow: false }],
    ],
    ["not-comparable", null, [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }]],
  ] as const;
  for (const [expected, target, entries] of cases) {
    assert.equal(standing({ ruleId: "r", path: "p", dependabot: target }, [...entries]), expected);
  }
});

test("blind and targeted repositories stay in separate groups and never blend", () => {
  const configured = record({
    repository: "o/blind",
    dependabot: {
      run: "not-run",
      configPath: ".github/dependabot.yml",
      entries: [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }],
    },
  });
  const result = buildResult([
    configured,
    record({ repository: "o/targeted", selection: "targeted", continuity: true }),
  ]);
  assert.deepEqual(
    result.groups.map((group) => [group.selection, group.repositories, group.repositoriesWithConfig]),
    [
      ["blind", 1, 1],
      ["targeted", 1, 0],
    ],
  );
  const blind = result.groups[0]!;
  assert.deepEqual(blind.outcomes, { covered: 1, uncovered: 1, filtered: 0, "not-comparable": 1 });
  assert.equal(blind.uncoveredWithConfig, 1);
  assert.equal(blind.uncoveredWithoutConfig, 0);
  assert.deepEqual(blind.byEcosystem, [{ packageEcosystem: "npm", counts: { covered: 1, uncovered: 1, filtered: 0 } }]);
  assert.deepEqual(blind.notComparableRules, [{ family: "nodejs.runtime", findings: 1 }]);
  assert.deepEqual(result.continuity, ["o/targeted"]);
  assert.equal(result.dependabot.run, "not-run");
});

test("uncovered findings are split by whether the repository commits a config", () => {
  const result = buildResult([record({ repository: "o/none" })]);
  const group = result.groups[0]!;
  assert.equal(group.repositoriesWithConfig, 0);
  assert.equal(group.uncoveredWithoutConfig, 2);
  assert.equal(group.uncoveredWithConfig, 0);
  assert.equal(group.outcomes.covered, 0);
  assert.deepEqual(result.configuredRepositories, []);
});

test("configured repositories and parser errors are listed for the audit table", () => {
  const result = buildResult([
    record({
      repository: "o/a",
      dependabot: {
        run: "not-run",
        configPath: ".github/dependabot.yml",
        entries: [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }],
      },
    }),
    record({
      repository: "o/b",
      dependabot: { run: "not-run", configPath: ".github/dependabot.yaml", entries: [], parseError: "bad yaml" },
    }),
  ]);
  assert.deepEqual(
    result.configuredRepositories.map((row) => [row.repository, row.entries, row.covered, row.uncovered]),
    [
      ["o/a", 1, 1, 1],
      ["o/b", 0, 0, 2],
    ],
  );
  assert.deepEqual(result.configErrors, [{ repository: "o/b", detail: "bad yaml" }]);
});

test("the report names the run as not executed and links every committed config", () => {
  const result = buildResult([
    record({
      repository: "o/a",
      dependabot: {
        run: "not-run",
        configPath: ".github/dependabot.yml",
        entries: [{ packageEcosystem: "npm", directory: "/", ignore: false, allow: false }],
      },
    }),
  ]);
  const markdown = renderMarkdown(result);
  assert.match(markdown, /Dependabot was not run/);
  assert.match(markdown, /## By Dependabot package-ecosystem/);
  assert.ok(markdown.includes(`https://github.com/o/a/blob/${"a".repeat(40)}/.github/dependabot.yml`));
  assert.match(markdown, /`nodejs\.runtime` \| 1/);
  assert.match(renderJson(buildResult([])), /"groups": \[\]/);
});

test("build writes the result and --check detects staleness", async () => {
  const root = await mkdtemp(join(tmpdir(), "dependabot-comparison-test-"));
  try {
    const dir = join(root, "benchmarks/comparison/dependabot");
    await mkdir(join(dir, "raw"), { recursive: true });
    await writeFile(join(dir, "raw/o__a.json"), JSON.stringify(record({ repository: "o/a" })));
    assert.equal(await build(["--check"], root), 1);
    assert.equal(await build([], root), 0);
    assert.equal(await build(["--check"], root), 0);
    await writeFile(join(dir, "dependabot.md"), "stale\n");
    assert.equal(await build(["--check"], root), 1);
    const written = JSON.parse(await readFile(join(dir, "dependabot.json"), "utf8")) as { groups: unknown[] };
    assert.equal(written.groups.length, 1);
    await writeFile(
      join(dir, "raw/o__b.json"),
      JSON.stringify({ ...record({ repository: "o/b" }), schemaVersion: "x" }),
    );
    await assert.rejects(build([], root), /unexpected schemaVersion/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
