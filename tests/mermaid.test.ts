import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import type { Forecast, ForecastEvent } from "../src/forecast.js";
import { MERMAID_MAX_BARS, renderForecastMermaid, renderScanMermaid } from "../src/mermaid.js";
import { runCli } from "./cli-runner.js";

const asOf = "2026-10-30";

function finding(ruleId: string, title: string, deadline?: string, path = "package.json"): Finding {
  return {
    id: `${ruleId}:${path}`,
    ruleId,
    detector: "npm",
    title,
    summary: "Summary",
    severity: "high",
    confidence: "exact",
    location: { path },
    ...(deadline === undefined ? {} : { deadline }),
    sources: [{ title: "Source", url: "https://example.com/source" }],
  };
}

const scan = (findings: Finding[]): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: ".",
  scannedAt: "2026-10-30T00:00:00.000Z",
  findings,
  diagnostics: [],
});

const event = (date: string, title: string, ecosystem: string, severity: Severity = "high"): ForecastEvent => ({
  date,
  ruleId: `rule.${date}`,
  ecosystem,
  title,
  severity,
  source: "https://example.com/source",
  findings: [],
});

const forecastOf = (events: ForecastEvent[], today = asOf): Forecast => {
  const months = new Map<string, ForecastEvent[]>();
  for (const item of [...events].sort((left, right) => left.date.localeCompare(right.date))) {
    const month = item.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), item]);
  }
  return {
    schemaVersion: "evergreen.forecast.v1",
    root: ".",
    today,
    until: "2027-10-30",
    months: 12,
    groups: [...months].map(([month, items]) => ({ month, events: items })),
    affecting: events.filter((item) => item.findings.length > 0).length,
    total: events.length,
  };
};

interface Chart {
  sections: string[];
  bars: Array<{ label: string; tags: string[]; id: string; start: string; end: string }>;
  omitted: string | undefined;
}

/** A deliberately small Gantt grammar check: fenced block, directives, sections, and task statements. */
function parseChart(output: string): Chart {
  const lines = output.split("\n");
  assert.equal(lines[0], "```mermaid");
  const close = lines.indexOf("```", 1);
  assert.ok(close > 2, "closing fence");
  const body = lines.slice(1, close);
  assert.equal(body[0], "gantt");
  assert.match(body[1]!, /^ {4}title \S/);
  assert.equal(body[2], "    dateFormat YYYY-MM-DD");
  assert.match(body[3]!, /^ {4}axisFormat %/);
  assert.equal(body[4], "    todayMarker off");

  const sections: string[] = [];
  const bars: Chart["bars"] = [];
  const ids = new Set<string>();
  for (const line of body.slice(5)) {
    if (line === "") continue;
    const section = /^ {4}section (.+)$/.exec(line);
    if (section) {
      sections.push(section[1]!);
      continue;
    }
    const bar = /^ {4}(.+?) : ?((?:(?:crit|milestone), )*?)(\w+), (\d{4}-\d{2}-\d{2}), (\d{4}-\d{2}-\d{2}|0d)$/.exec(
      line,
    );
    assert.ok(bar, `not a Gantt statement: ${line}`);
    assert.ok(sections.length > 0, "a task belongs to a section");
    const [, label, tags, id, start, end] = bar;
    assert.ok(!ids.has(id!), `duplicate task id ${id}`);
    ids.add(id!);
    assert.ok(!Number.isNaN(Date.parse(start!)));
    if (end === "0d") {
      assert.ok(tags!.includes("milestone"), `${label} has no end but is not a milestone`);
    } else {
      assert.ok(!tags!.includes("milestone"), `${label} is an open-ended milestone`);
      assert.ok(end! >= start!, `${label} ends before it starts`);
    }
    bars.push({
      label: label!,
      tags: tags!.split(", ").filter((tag) => tag.length > 0),
      id: id!,
      start: start!,
      end: end!,
    });
  }
  return { sections, bars, omitted: lines.slice(close + 1).join("\n") || undefined };
}

test("a scan renders a golden Gantt chart, one section per ecosystem", () => {
  const output = renderScanMermaid(
    scan([
      finding("npm.package.request.deprecated", "request is deprecated", "2026-11-15"),
      finding("npm.package.request.deprecated", "request is deprecated", "2026-11-15", "src/client.js"),
      finding("nodejs.runtime.eol-18", "Node.js 18 is end-of-life", "2026-04-30"),
      finding("github-actions.checkout.node20", "Unsupported actions/checkout runtime", "2027-06-01"),
      finding("npm.package.undated.deprecated", "No date to draw"),
    ]),
    asOf,
  );
  assert.equal(
    output,
    [
      "```mermaid",
      "gantt",
      "    title Evergreen support windows",
      "    dateFormat YYYY-MM-DD",
      "    axisFormat %Y-%m",
      "    todayMarker off",
      "",
      "    section github-actions",
      "    Unsupported actions/checkout runtime :bar0, 2026-10-30, 2027-06-01",
      "",
      "    section nodejs",
      "    Node.js 18 is end-of-life :crit, milestone, bar1, 2026-04-30, 0d",
      "",
      "    section npm",
      "    request is deprecated :crit, bar2, 2026-10-30, 2026-11-15",
      "",
      "    section today",
      `    today ${asOf} : milestone, marker, ${asOf}, 0d`,
      "```",
    ].join("\n"),
  );
});

test("a forecast renders the same chart from its dated events", () => {
  const output = renderForecastMermaid(
    forecastOf([
      event("2027-04-30", "request is deprecated", "npm"),
      event("2026-11-12", "Node.js 20 reaches end-of-life on 2026-11-12", "nodejs"),
    ]),
  );
  assert.equal(
    output,
    [
      "```mermaid",
      "gantt",
      "    title Evergreen support windows",
      "    dateFormat YYYY-MM-DD",
      "    axisFormat %Y-%m",
      "    todayMarker off",
      "",
      "    section nodejs",
      "    Node.js 20 reaches end-of-life on 2026-11-12 :crit, bar0, 2026-10-30, 2026-11-12",
      "",
      "    section npm",
      "    request is deprecated :bar1, 2026-10-30, 2027-04-30",
      "",
      "    section today",
      `    today ${asOf} : milestone, marker, ${asOf}, 0d`,
      "```",
    ].join("\n"),
  );
});

test("names Mermaid treats as syntax are escaped, and whitespace stays on one line", () => {
  const output = renderScanMermaid(
    scan([finding("npm.weird", "Name: #55; semi; colon\nnext line", "2027-01-01")]),
    asOf,
  );
  assert.match(output, /    Name#58; #35;55#59; semi#59; colon next line :bar0, /);
  const chart = parseChart(output);
  assert.equal(chart.bars[0]!.label, "Name#58; #35;55#59; semi#59; colon next line");
});

test("the chart is capped at the documented number of bars and counts the rest", () => {
  const findings = Array.from({ length: MERMAID_MAX_BARS + 5 }, (_, index) =>
    finding(
      `npm.package.pkg-${String(index).padStart(2, "0")}.deprecated`,
      `package ${index}`,
      `2027-01-${String((index % 28) + 1).padStart(2, "0")}`,
    ),
  );
  const chart = parseChart(renderScanMermaid(scan(findings), asOf));
  assert.equal(chart.bars.filter((bar) => bar.id !== "marker").length, MERMAID_MAX_BARS);
  assert.equal(chart.omitted, "and 5 more");
  assert.equal(parseChart(renderScanMermaid(scan(findings.slice(0, MERMAID_MAX_BARS)), asOf)).omitted, undefined);
});

test("--as-of controls the today marker and every bar start, so output is reproducible", async () => {
  const result = scan([finding("npm.package.request.deprecated", "request is deprecated", "2026-11-15")]);
  assert.equal(renderScanMermaid(result, "2026-10-30"), renderScanMermaid(result, "2026-10-30"));
  assert.notEqual(renderScanMermaid(result, "2026-10-30"), renderScanMermaid(result, "2026-10-31"));

  const root = await mkdtemp(join(tmpdir(), "evergreen-mermaid-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(
      join(root, ".github", "workflows", "ci.yml"),
      "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
    );
    const run = (...args: string[]) => runCli(args);
    const first = await run("scan", root, "--format", "mermaid", "--as-of", asOf);
    const second = await run("scan", root, "--format", "mermaid", "--as-of", asOf);
    assert.equal(first.stdout, second.stdout);
    const chart = parseChart(first.stdout);
    assert.deepEqual(chart.sections, ["github-actions", "today"]);
    assert.equal(chart.bars.at(-1)!.label, `today ${asOf}`);

    const demo = resolve("examples/demo");
    const forecast = await run("forecast", demo, "--format", "mermaid", "--as-of", asOf);
    assert.equal(forecast.stdout, (await run("forecast", demo, "--format", "mermaid", "--as-of", asOf)).stdout);
    assert.ok(parseChart(forecast.stdout).bars.length > 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mermaid is accepted by scan and forecast and refused elsewhere", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-mermaid-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(
      join(root, ".github", "workflows", "ci.yml"),
      "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
    );
    const run = (...args: string[]) => runCli(args);
    assert.match((await run("scan", root, "--format", "mermaid", "--as-of", asOf)).stdout, /^```mermaid\ngantt\n/);
    const check = await run("check", "pkg:npm/request", "--format", "mermaid");
    assert.equal(check.code, 2);
    const explain = await run("explain", "x", root, "--format", "mermaid");
    assert.equal(explain.code, 2);
    assert.match(explain.stderr, /only available for the scan and forecast commands/);
    const conflict = await run("forecast", root, "--format", "mermaid", "--timeline", "--as-of", asOf);
    assert.equal(conflict.code, 2);
    assert.match(conflict.stderr, /Use either --timeline or --format mermaid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
