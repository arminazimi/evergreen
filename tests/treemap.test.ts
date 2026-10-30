import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { renderHtml } from "../src/reporters.js";
import {
  layoutTreemap,
  renderTreemapSvg,
  TREEMAP_DIRECTORY_FILE_LIMIT,
  TREEMAP_PALETTE,
  TREEMAP_SEVERITY_WEIGHT,
  treemapFileId,
  type TreemapFinding,
  type TreemapLayout,
} from "../src/treemap.js";

const treemapFinding = (path: string, severity: Severity): TreemapFinding => ({ location: { path }, severity });

const finding = (path: string, severity: Severity): Finding => ({
  id: `${path}:${severity}`,
  ruleId: "rule.example",
  detector: "example",
  title: `Title for ${path}`,
  summary: "Summary",
  severity,
  confidence: "exact",
  location: { path },
  sources: [{ title: "Source", url: "https://example.com/source" }],
});

const scan = (findings: Finding[]): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/machine/specific/root",
  scannedAt: "2026-10-16T00:00:00.000Z",
  findings,
  diagnostics: [],
});

const area = (box: { width: number; height: number }): number => box.width * box.height;
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

function leafOf(layout: TreemapLayout, path: string) {
  for (const directory of layout.directories) {
    const leaf = directory.leaves.find((candidate) => candidate.path === path);
    if (leaf) return leaf;
  }
  return undefined;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (light! + 0.05) / (dark! + 0.05);
}

test("the same findings always produce the same layout and SVG, in any input order", () => {
  const findings = [
    treemapFinding("src/b.ts", "high"),
    treemapFinding("src/a.ts", "critical"),
    treemapFinding("src/a.ts", "low"),
    treemapFinding("package.json", "medium"),
    treemapFinding("src/deep/c.ts", "info"),
  ];
  const layout = layoutTreemap(findings);
  assert.deepEqual(layoutTreemap(findings), layout);
  assert.deepEqual(layoutTreemap([...findings].reverse()), layout);
  assert.equal(renderTreemapSvg(findings), renderTreemapSvg([...findings].reverse()));
  assert.equal(renderTreemapSvg(findings), renderTreemapSvg(findings));
});

test("file and directory areas are proportional to their severity-weighted findings within 1%", () => {
  const findings = [
    treemapFinding("src/critical.ts", "critical"),
    treemapFinding("src/critical.ts", "critical"),
    treemapFinding("src/high.ts", "high"),
    treemapFinding("src/medium.ts", "medium"),
    treemapFinding("src/low.ts", "low"),
    treemapFinding("src/info.ts", "info"),
    treemapFinding("docs/guide.md", "critical"),
    treemapFinding("package.json", "medium"),
  ];
  const layout = layoutTreemap(findings);
  const directory = layout.directories.find((candidate) => candidate.path === "src")!;
  const inner = sum(directory.leaves.map(area));
  for (const leaf of directory.leaves) {
    assert.ok(Math.abs(area(leaf) / inner - leaf.weight / directory.weight) <= 0.01, `${leaf.path} keeps its share of the area`);
    assert.equal(leaf.weight, sum(findings.filter((item) => item.location.path === leaf.path).map((item) => TREEMAP_SEVERITY_WEIGHT[item.severity])));
  }
  const whole = layout.width * layout.height;
  const totalWeight = sum(layout.directories.map((item) => item.weight));
  for (const item of layout.directories) {
    assert.ok(Math.abs(area(item) / whole - item.weight / totalWeight) <= 0.01, `${item.path} keeps its share of the canvas`);
  }
});

test("a critical finding weighs as much as sixteen info findings", () => {
  const layout = layoutTreemap([
    treemapFinding("src/critical.ts", "critical"),
    ...Array.from({ length: 16 }, () => treemapFinding("src/info.ts", "info")),
  ]);
  assert.deepEqual(TREEMAP_SEVERITY_WEIGHT, { critical: 8, high: 4, medium: 2, low: 1, info: 0.5 });
  assert.equal(leafOf(layout, "src/critical.ts")!.weight, leafOf(layout, "src/info.ts")!.weight);
});

test("a file is colored by its most severe finding", () => {
  const layout = layoutTreemap([
    treemapFinding("src/medium.ts", "low"),
    treemapFinding("src/medium.ts", "medium"),
    treemapFinding("src/critical.ts", "critical"),
  ]);
  assert.equal(leafOf(layout, "src/medium.ts")!.severity, "medium");
  assert.equal(leafOf(layout, "src/critical.ts")!.severity, "critical");
  const svg = renderTreemapSvg([treemapFinding("src/medium.ts", "medium"), treemapFinding("src/medium.ts", "low")]);
  assert.match(svg, /class="tm-cell medium tm-file"/);
  assert.match(svg, /\.tm-cell\.medium \.tm-fill\{fill:var\(--tm-medium\)\}/);
});

test("a directory past the limit folds its smallest files into one rectangle", () => {
  const files = Array.from({ length: TREEMAP_DIRECTORY_FILE_LIMIT + 5 }, (_, index) => {
    const name = `src/file-${String(index).padStart(3, "0")}.ts`;
    return index < TREEMAP_DIRECTORY_FILE_LIMIT ? treemapFinding(name, "high") : treemapFinding(name, "medium");
  });
  const layout = layoutTreemap(files);
  const directory = layout.directories[0]!;
  assert.equal(directory.leaves.length, TREEMAP_DIRECTORY_FILE_LIMIT + 1);
  const collapsed = directory.leaves.find((leaf) => leaf.path === undefined)!;
  assert.equal(collapsed.label, "5 more files");
  assert.equal(collapsed.hidden, 5);
  assert.equal(collapsed.weight, 5 * TREEMAP_SEVERITY_WEIGHT.medium);
  assert.equal(collapsed.findings, 5);
  assert.equal(collapsed.severity, "medium");
  assert.equal(directory.leaves.filter((leaf) => leaf.path !== undefined).length, TREEMAP_DIRECTORY_FILE_LIMIT);
  assert.ok(leafOf(layout, "src/file-199.ts"), "the largest files stay individual");
  assert.ok(!leafOf(layout, "src/file-204.ts"), "the smallest files are folded");
  assert.match(renderTreemapSvg(files), /<title>5 more files in src: 5 findings \(medium 5\)<\/title>/);
});

test("a directory at the limit is not collapsed", () => {
  const files = Array.from({ length: TREEMAP_DIRECTORY_FILE_LIMIT }, (_, index) => treemapFinding(`src/file-${index}.ts`, "high"));
  const layout = layoutTreemap(files);
  assert.equal(layout.directories[0]!.leaves.length, TREEMAP_DIRECTORY_FILE_LIMIT);
  assert.ok(layout.directories[0]!.leaves.every((leaf) => leaf.path !== undefined));
});

test("text on every severity color has at least 4.5:1 contrast in light and dark", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const severity of Object.keys(TREEMAP_PALETTE[scheme]) as Severity[]) {
      const color = TREEMAP_PALETTE[scheme][severity];
      assert.ok(contrast(color.text, color.fill) >= 4.5, `${scheme} ${severity} text stays readable`);
    }
  }
});

test("every file rectangle links to its report section, is focusable, and names its path and counts", () => {
  const result = scan([
    finding("src/a.ts", "high"),
    finding("src/a.ts", "low"),
    finding("package.json", "critical"),
  ]);
  const html = renderHtml(result);
  const svg = /<svg [^>]*class="evergreen-treemap"[^]*?<\/svg>/.exec(html)?.[0];
  assert.ok(svg, "the treemap is rendered");
  assert.match(svg, /<title>src\/a\.ts: 2 findings \(high 1, low 1\)<\/title>/);
  assert.match(svg, /<title>package\.json: 1 finding \(critical 1\)<\/title>/);
  for (const path of ["src/a.ts", "package.json"]) {
    const id = treemapFileId(path);
    assert.ok(svg.includes(`href="#${id}"`), `${path} links to its section`);
    assert.ok(html.includes(`<section class="path" id="${id}">`), `${path} has the matching section id`);
  }
  assert.equal(svg.match(/tabindex="0"/g)?.length, 2, "each rectangle is keyboard-focusable");
  assert.equal(html.match(/<section class="path" id="/g)?.length, 2, "a path used by several severities keeps one id");
});

test("the treemap and the report stay self-contained", () => {
  const html = renderHtml(scan([finding("src/a.ts", "high")]));
  const svg = /<svg [^>]*class="evergreen-treemap"[^]*?<\/svg>/.exec(html)?.[0]!;
  const urls = svg.match(/https?:\/\/[^"' )]+/g) ?? [];
  assert.deepEqual(urls, ["http://www.w3.org/2000/svg"], "the SVG names only its XML namespace");
  assert.doesNotMatch(svg, /<script|<image|<use|url\(|@import/i);
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!/<(?:link|img|iframe|object|embed|source|video|audio)\b/i.test(html));
  assert.ok(!/src\s*=/i.test(html) && !/@import|url\(/i.test(html));
});

test("the width and height options set the canvas and keep a readable minimum", () => {
  const findings = [treemapFinding("src/a.ts", "high")];
  const wide = layoutTreemap(findings, { width: 900, height: 500 });
  assert.equal(wide.width, 900);
  assert.equal(wide.height, 500);
  assert.match(renderTreemapSvg(findings, { width: 900, height: 500 }), /width="900" height="500" viewBox="0 0 900 500"/);
  const small = layoutTreemap(findings, { width: 100, height: 80 });
  assert.equal(small.width, 320);
  assert.equal(small.height, 160);
});

test("no findings render no treemap", () => {
  assert.equal(renderTreemapSvg([]), "");
  assert.equal(layoutTreemap([]).directories.length, 0);
  const html = renderHtml(scan([]));
  assert.ok(!html.includes('<section class="treemap">'));
  assert.ok(!html.includes("evergreen-treemap"));
});

test("paths from the repository are escaped everywhere the treemap prints them", () => {
  const hostile = `<script>alert("x")</script> & 'q'`;
  const html = renderHtml(scan([finding(hostile, "high")]));
  const svg = /<svg [^>]*class="evergreen-treemap"[^]*?<\/svg>/.exec(html)?.[0]!;
  assert.doesNotMatch(svg, /<script/);
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &apos;q&apos;/);
  assert.equal(html.match(/<\/script>/g)?.length, 1, "no path can close the embedded data block");
});
