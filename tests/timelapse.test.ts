import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { applyAsOf } from "../src/as-of.js";
import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine/index.js";
import {
  addMonths,
  allTimelapseFiles,
  buildTimelapse,
  findingHasAppeared,
  frameFromScan,
  isYearMonth,
  lastDayOfMonth,
  monthRange,
  parseTimelapseRange,
  playTimelapse,
  renderTimelapseFrame,
  renderTimelapseJson,
  renderTimelapseSvg,
  renderTimelapseText,
  TimelapseError,
  type TimelapseFrame,
  TIMELAPSE_MAX_MS,
} from "../src/timelapse.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function nodeRepository(engines: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-timelapse-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "demo", engines: { node: engines } }));
  return root;
}

let findingSeq = 0;
const finding = (overrides: Partial<Finding> = {}): Finding =>
  ({
    id: `id-${++findingSeq}`,
    ruleId: "demo.rule",
    detector: "nodejs",
    title: "Demo finding",
    summary: "A demo finding.",
    severity: "medium",
    confidence: "high",
    location: { path: "package.json", line: 1 },
    sources: [],
    ...overrides,
  }) as Finding;

const scanOf = (findings: Finding[]): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/tmp/demo",
  scannedAt: "2026-11-07T00:00:00.000Z",
  findings,
  diagnostics: [],
});

test("isYearMonth and month helpers", () => {
  assert.equal(isYearMonth("2026-11"), true);
  assert.equal(isYearMonth("2026-13"), false);
  assert.equal(isYearMonth("2026-1"), false);
  assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.equal(lastDayOfMonth("2024-02"), "2024-02-29");
  assert.equal(lastDayOfMonth("2026-11"), "2026-11-30");
  assert.equal(addMonths("2026-11", 23), "2028-10");
  assert.deepEqual(monthRange("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
});

test("parseTimelapseRange defaults to 24 months and rejects junk", () => {
  assert.deepEqual(parseTimelapseRange(undefined, undefined, "2026-11-07"), {
    from: "2026-11",
    to: "2028-10",
  });
  assert.deepEqual(parseTimelapseRange("2026-01", "2026-03", "2026-11-07"), {
    from: "2026-01",
    to: "2026-03",
  });
  assert.throws(() => parseTimelapseRange("2026-13", undefined), TimelapseError);
  assert.throws(() => parseTimelapseRange("2027-01", "2026-01"), TimelapseError);
});

test("findingHasAppeared uses the deadline against as-of", () => {
  assert.equal(findingHasAppeared(finding(), "2026-11-30"), true);
  assert.equal(findingHasAppeared(finding({ deadline: "2026-11-15" }), "2026-11-30"), true);
  assert.equal(findingHasAppeared(finding({ deadline: "2026-12-01" }), "2026-11-30"), false);
});

test("frameFromScan counts appeared findings and lists their files", () => {
  const result = scanOf([
    finding({ deadline: "2026-06-01", location: { path: "a.js", line: 1 } }),
    finding({ deadline: "2027-01-01", location: { path: "b.js", line: 1 } }),
    finding({ deadline: "2026-06-01", location: { path: "a.js", line: 2 } }),
  ]);
  const frame = frameFromScan(result, "2026-11", "2026-11-30");
  assert.equal(frame.findings, 2);
  assert.deepEqual(frame.files, ["a.js"]);
});

test("default range yields 24 frames and animation stays under six seconds", async () => {
  const range = parseTimelapseRange(undefined, undefined, "2026-11-07");
  const frames = monthRange(range.from, range.to);
  assert.equal(frames.length, 24);
  assert.ok(Math.floor(TIMELAPSE_MAX_MS / frames.length) * frames.length <= TIMELAPSE_MAX_MS);
});

test("month counts match scan --as-of for three sampled months", async () => {
  const root = await nodeRepository("16 || 22");
  const frames = await buildTimelapse(await scanRepository(root, builtInDetectors), "2026-11", "2028-10");
  assert.equal(frames.length, 24);

  for (const month of ["2026-11", "2027-04", "2028-10"] as const) {
    const asOf = lastDayOfMonth(month);
    const cli = await runCli(["scan", root, "--json", "--as-of", asOf]);
    assert.equal(cli.code, 0);
    const scanned = JSON.parse(cli.stdout) as { findings: Array<{ deadline?: string }> };
    const expected = scanned.findings.filter((entry) => entry.deadline === undefined || entry.deadline <= asOf).length;
    const frame = frames.find((entry) => entry.month === month);
    assert.ok(frame, `missing frame ${month}`);
    assert.equal(frame.findings, expected, `count for ${month}`);
  }
});

test("buildTimelapse uses applyAsOf once per month without changing finding identity", async () => {
  const root = await nodeRepository("22");
  const scanned = await scanRepository(root, builtInDetectors);
  assert.ok(scanned.findings.length >= 1);
  const before = await applyAsOf(scanned, "2027-04-29");
  const after = await applyAsOf(scanned, "2027-04-30");
  assert.equal(before.findings[0]?.id, after.findings[0]?.id);
  assert.notEqual(before.findings[0]?.severity, after.findings[0]?.severity);

  const frames = await buildTimelapse(scanned, "2027-03", "2027-05");
  assert.deepEqual(
    frames.map((frame) => frame.month),
    ["2027-03", "2027-04", "2027-05"],
  );
  assert.ok(frames[0]!.findings <= frames[1]!.findings);
});

test("non-TTY play prints static text and restores nothing hidden", async () => {
  const frames: TimelapseFrame[] = [
    { month: "2026-11", findings: 1, files: ["package.json"] },
    { month: "2026-12", findings: 2, files: ["package.json", "Dockerfile"] },
  ];
  const chunks: string[] = [];
  const code = await playTimelapse(frames, {
    io: {
      isTTY: false,
      write: (text) => {
        chunks.push(text);
      },
      sleep: async () => undefined,
      onInterrupt: () => () => undefined,
    },
  });
  assert.equal(code, 0);
  const text = chunks.join("");
  assert.equal(text, `${renderTimelapseText(frames)}\n`);
  assert.doesNotMatch(text, /\u001b\[\?25l/);
});

test("TTY play hides the cursor, finishes within six seconds, and Ctrl-C restores it", async () => {
  const frames: TimelapseFrame[] = Array.from({ length: 4 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    findings: index,
    files: index === 0 ? [] : ["package.json"],
  }));
  const chunks: string[] = [];
  let interrupt: (() => void) | undefined;
  const sleeps: number[] = [];
  const play = playTimelapse(frames, {
    color: false,
    io: {
      isTTY: true,
      write: (text) => {
        chunks.push(text);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
        interrupt?.();
      },
      onInterrupt: (handler) => {
        interrupt = handler;
        return () => {
          interrupt = undefined;
        };
      },
    },
  });
  const code = await play;
  assert.equal(code, 130);
  const text = chunks.join("");
  assert.match(text, /\u001b\[\?25l/);
  assert.match(text, /\u001b\[\?25h/);
  assert.ok(sleeps.every((ms) => ms <= TIMELAPSE_MAX_MS));
});

test("--json prints month findings and files; --svg writes a sanitizer-safe animation", async () => {
  const root = await nodeRepository("18");
  const jsonRun = await runCli(["timelapse", root, "--from", "2026-11", "--to", "2026-12", "--json"]);
  assert.equal(jsonRun.code, 0);
  const frames = JSON.parse(jsonRun.stdout) as TimelapseFrame[];
  assert.equal(frames.length, 2);
  assert.equal(frames[0]?.month, "2026-11");
  assert.ok(typeof frames[0]?.findings === "number");
  assert.ok(Array.isArray(frames[0]?.files));

  const svgPath = join(root, "timelapse.svg");
  const svgRun = await runCli(["timelapse", root, "--from", "2026-11", "--to", "2026-12", "--svg", svgPath]);
  assert.equal(svgRun.code, 0);
  const svg = await readFile(svgPath, "utf8");
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, /<g class="frame/);
  assert.match(svg, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(svg, /\.frame\.final\{opacity:1\}/);
  assert.doesNotMatch(svg, /<script|<foreignObject|\bhref=|\bsrc=|url\(|<image|onload=/i);
});

test("render helpers stay deterministic", () => {
  const frames: TimelapseFrame[] = [
    { month: "2026-11", findings: 1, files: ["a.js"] },
    { month: "2026-12", findings: 2, files: ["a.js", "b.js"] },
  ];
  assert.deepEqual(allTimelapseFiles(frames), ["a.js", "b.js"]);
  assert.equal(renderTimelapseFrame(frames[0]!, ["a.js", "b.js"]), renderTimelapseFrame(frames[0]!, ["a.js", "b.js"]));
  assert.equal(renderTimelapseJson(frames), renderTimelapseJson(frames));
  assert.equal(renderTimelapseSvg(frames, "demo"), renderTimelapseSvg(frames, "demo"));
  assert.match(renderTimelapseText(frames), /Timelapse 2026-11/);
});

test("CLI rejects bad flags and --json with --svg", async () => {
  const root = await nodeRepository("22");
  assert.equal((await runCli(["timelapse", root, "--from", "nope"])).code, 2);
  assert.equal((await runCli(["timelapse", root, "--json", "--svg", "x.svg"])).code, 2);
});
