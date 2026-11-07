import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import type { Finding, Severity } from "../src/domain.js";
import { severityValues } from "../src/domain.js";
import type { Detector } from "../src/sdk.js";
import {
  BOARD_SEVERITY_WEIGHT,
  compareBoardSummaries,
  rankWatchBoard,
  renderWatchBoardText,
  runWatchBoard,
  severityBars,
  trendAgainst,
} from "../src/watch-board.js";
import { addWatched, summarizeFindings, watchStateFile, type WatchProjectSummary } from "../src/watch.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const machine = async () => {
  const home = await mkdtemp(join(tmpdir(), "evergreen-watch-board-"));
  roots.push(home);
  return { home, env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config") } };
};

const counts = (partial: Partial<Record<Severity, number>>): Record<Severity, number> => {
  const bySeverity = Object.fromEntries(severityValues.map((severity) => [severity, 0])) as Record<Severity, number>;
  for (const [severity, count] of Object.entries(partial) as Array<[Severity, number]>) {
    bySeverity[severity] = count;
  }
  return bySeverity;
};

const summary = (partial: Partial<Record<Severity, number>>, nextDeadline?: string): WatchProjectSummary => {
  const bySeverity = counts(partial);
  let score = 0;
  for (const severity of severityValues) score += bySeverity[severity] * BOARD_SEVERITY_WEIGHT[severity];
  return { score, bySeverity, ...(nextDeadline === undefined ? {} : { nextDeadline }) };
};

const finding = (severity: Severity, deadline?: string, id = severity): Finding =>
  ({
    id,
    ruleId: "rule",
    detector: "fake",
    title: severity,
    summary: "",
    severity,
    confidence: "exact",
    location: { path: "package.json" },
    sources: [],
    ...(deadline === undefined ? {} : { deadline }),
  }) as Finding;

/** A detector that reports fixed findings for whichever project path is scanned. */
const detectorMap = (byProject: Map<string, Finding[]>): Detector =>
  ({
    id: "fake",
    apiVersion: "evergreen.detector.v1",
    scan: async (context) => {
      const list = byProject.get(context.root);
      if (list === undefined) throw new Error(`unexpected project ${context.root}`);
      return list.map(({ id, ruleId, title, summary, severity, location, sources, deadline }) => ({
        id,
        ruleId,
        title,
        summary,
        severity,
        location,
        sources,
        ...(deadline === undefined ? {} : { deadline }),
      }));
    },
  }) as Detector;

test("BOARD_SEVERITY_WEIGHT matches the heatmap contract", () => {
  assert.deepEqual(BOARD_SEVERITY_WEIGHT, { critical: 8, high: 4, medium: 2, low: 1, info: 0.5 });
});

test("ranking breaks ties by earliest deadline, then by project name", () => {
  const alpha = { project: "/z/alpha", summary: summary({ high: 1 }, "2027-06-01") };
  const beta = { project: "/a/beta", summary: summary({ high: 1 }, "2027-01-01") };
  const gamma = { project: "/m/gamma", summary: summary({ high: 1 }, "2027-01-01") };
  const delta = { project: "/m/delta", summary: summary({ critical: 1 }, "2028-01-01") };
  const undated = { project: "/u/undated", summary: summary({ high: 1 }) };

  assert.ok(compareBoardSummaries(delta, alpha) < 0);
  assert.ok(compareBoardSummaries(beta, alpha) < 0);
  assert.ok(compareBoardSummaries(beta, gamma) < 0);
  assert.ok(compareBoardSummaries(gamma, undated) < 0);

  const rows = rankWatchBoard([alpha, beta, gamma, delta, undated], {});
  assert.deepEqual(
    rows.map((row) => row.project),
    ["/m/delta", "/a/beta", "/m/gamma", "/z/alpha", "/u/undated"],
  );
  assert.equal(rows[0]?.rank, 1);
  assert.equal(rows[0]?.trend, "same");
  assert.equal(rows[0]?.trendArrow, "●");
});

test("trend arrows compare against a seeded previous state", () => {
  assert.equal(trendAgainst(10, undefined), "same");
  assert.equal(trendAgainst(10, 10), "same");
  assert.equal(trendAgainst(12, 10), "worse");
  assert.equal(trendAgainst(8, 10), "better");

  const previous = {
    "/a": summary({ high: 1 }),
    "/b": summary({ critical: 1 }),
    "/c": summary({ medium: 2 }),
  };
  const rows = rankWatchBoard(
    [
      { project: "/a", summary: summary({ high: 2 }) },
      { project: "/b", summary: summary({ medium: 1 }) },
      { project: "/c", summary: summary({ medium: 2 }) },
      { project: "/d", summary: summary({ low: 1 }) },
    ],
    previous,
  );
  const byProject = Object.fromEntries(rows.map((row) => [row.project, row]));
  assert.equal(byProject["/a"]?.trendArrow, "▲");
  assert.equal(byProject["/b"]?.trendArrow, "▼");
  assert.equal(byProject["/c"]?.trendArrow, "●");
  assert.equal(byProject["/d"]?.trendArrow, "●");
});

test("an old state file without summaries loads and shows ● for every project", async () => {
  const { home, env } = await machine();
  const project = resolve(home, "app");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({ name: "app" }, null, 2)}\n`);
  await addWatched(project, { env });

  const statePath = watchStateFile(env);
  await writeFile(statePath, `${JSON.stringify({ projects: [project], seen: [] }, null, 2)}\n`);
  const raw = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
  assert.equal("summaries" in raw, false);

  const findings = new Map<string, Finding[]>([[project, [finding("high", "2027-03-01")]]]);
  const board = await runWatchBoard([detectorMap(findings)], { env });
  assert.equal(board.schemaVersion, "evergreen.watch-board.v1");
  assert.equal(board.rows.length, 1);
  assert.equal(board.rows[0]?.trend, "same");
  assert.equal(board.rows[0]?.trendArrow, "●");
  assert.equal(board.rows[0]?.nextDeadline, "2027-03-01");

  const stored = JSON.parse(await readFile(statePath, "utf8")) as {
    summaries: Record<string, WatchProjectSummary>;
  };
  assert.equal(stored.summaries[project]?.score, BOARD_SEVERITY_WEIGHT.high);
});

test("a second board run writes trends from the stored summaries", async () => {
  const { home, env } = await machine();
  const safer = resolve(home, "safer");
  const riskier = resolve(home, "riskier");
  for (const project of [safer, riskier]) await mkdir(project, { recursive: true });
  await addWatched(safer, { env });
  await addWatched(riskier, { env });

  const firstMap = new Map<string, Finding[]>([
    [safer, [finding("critical")]],
    [riskier, [finding("medium")]],
  ]);
  const first = await runWatchBoard([detectorMap(firstMap)], { env });
  assert.deepEqual(
    first.rows.map((row) => row.name),
    ["safer", "riskier"],
  );

  const secondMap = new Map<string, Finding[]>([
    [safer, [finding("low")]],
    [riskier, [finding("critical"), finding("high")]],
  ]);
  const second = await runWatchBoard([detectorMap(secondMap)], { env });
  assert.equal(second.rows[0]?.name, "riskier");
  assert.equal(second.rows[0]?.trendArrow, "▲");
  assert.equal(second.rows[1]?.name, "safer");
  assert.equal(second.rows[1]?.trendArrow, "▼");
});

test("non-TTY board text uses plain hashes and no ANSI color", () => {
  const board = {
    schemaVersion: "evergreen.watch-board.v1" as const,
    projects: 1,
    rows: rankWatchBoard([{ project: "/tmp/demo", summary: summary({ critical: 2, low: 1 }, "2027-01-01") }], {}),
    failed: [],
  };
  const plain = renderWatchBoardText(board, { color: false });
  assert.match(plain, /RANK/);
  assert.match(plain, /## #/);
  assert.doesNotMatch(plain, /\u001b\[/);
  assert.match(plain, /●/);

  const colored = renderWatchBoardText(board, { color: true });
  assert.match(colored, /\u001b\[/);
  assert.equal(severityBars(counts({ critical: 2 }), { color: false }), "##");
});

test("summarizeFindings scores with the heatmap weights", () => {
  const result = summarizeFindings([finding("critical"), finding("info"), finding("high", "2026-12-01")]);
  assert.equal(result.score, 8 + 0.5 + 4);
  assert.equal(result.nextDeadline, "2026-12-01");
});

test("an empty watch list renders the same advice as list", async () => {
  const { env } = await machine();
  const board = await runWatchBoard([], { env });
  assert.equal(board.projects, 0);
  assert.equal(renderWatchBoardText(board), "No projects are watched. Add one with `evergreen watch add <path>`.");
});
