import { createHash } from "node:crypto";

import type { Severity } from "./domain.js";
import { severityValues } from "./domain.js";

/** The severity-weighted area each finding adds to its file: a critical finding takes sixteen times the area of an info finding. */
export const TREEMAP_SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
  info: 0.5,
};

/** Directories with more files than this keep their largest files and fold the rest into one rectangle. */
export const TREEMAP_DIRECTORY_FILE_LIMIT = 200;

export const TREEMAP_DEFAULT_WIDTH = 720;
export const TREEMAP_DEFAULT_HEIGHT = 360;

/** The report's severity colors, with the text color that keeps at least 4.5:1 contrast on each fill. */
export interface TreemapColor {
  fill: string;
  text: string;
}

export const TREEMAP_PALETTE: Record<"light" | "dark", Record<Severity, TreemapColor>> = {
  light: {
    critical: { fill: "#cf222e", text: "#ffffff" },
    high: { fill: "#cf222e", text: "#ffffff" },
    medium: { fill: "#bf8700", text: "#1b1f24" },
    low: { fill: "#0969da", text: "#ffffff" },
    info: { fill: "#0969da", text: "#ffffff" },
  },
  dark: {
    critical: { fill: "#ff7b72", text: "#0d1117" },
    high: { fill: "#ff7b72", text: "#0d1117" },
    medium: { fill: "#d29922", text: "#0d1117" },
    low: { fill: "#58a6ff", text: "#0d1117" },
    info: { fill: "#58a6ff", text: "#0d1117" },
  },
};

/** The finding fields the treemap reads. A whole `Finding` satisfies this. */
export interface TreemapFinding {
  readonly location: { readonly path: string };
  readonly severity: Severity;
}

export interface TreemapOptions {
  /** Total width in pixels. Defaults to 720. */
  width?: number;
  /** Total height in pixels. Defaults to 360. */
  height?: number;
}

export interface TreemapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapLeaf extends TreemapBox {
  /** The file path, or `undefined` for a collapsed "N more files" rectangle. */
  path: string | undefined;
  label: string;
  severity: Severity;
  weight: number;
  findings: number;
  counts: Record<Severity, number>;
  /** Files folded into this rectangle; 0 for a single file. */
  hidden: number;
}

export interface TreemapDirectory extends TreemapBox {
  path: string;
  weight: number;
  findings: number;
  leaves: TreemapLeaf[];
}

export interface TreemapLayout {
  width: number;
  height: number;
  findings: number;
  files: number;
  directories: TreemapDirectory[];
}

interface FileNode {
  path: string;
  weight: number;
  findings: number;
  severity: Severity;
  counts: Record<Severity, number>;
}

type LeafInput = Omit<TreemapLeaf, keyof TreemapBox>;

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

function emptyCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

/** The worst width-to-height ratio in a row, the measure the squarified algorithm minimizes. */
function worstRatio(areas: readonly number[], side: number): number {
  const area = total(areas);
  if (area <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
  const largest = Math.max(...areas);
  const smallest = Math.min(...areas);
  return Math.max((side * side * largest) / (area * area), (area * area) / (side * side * smallest));
}

function placeRow(areas: readonly number[], box: TreemapBox, output: TreemapBox[]): TreemapBox {
  const area = total(areas);
  if (box.width <= 0 || box.height <= 0 || area <= 0) {
    for (let index = 0; index < areas.length; index += 1) output.push({ x: box.x, y: box.y, width: 0, height: 0 });
    return box;
  }
  if (box.width >= box.height) {
    const thickness = area / box.height;
    let y = box.y;
    for (const item of areas) {
      const height = item / thickness;
      output.push({ x: box.x, y, width: thickness, height });
      y += height;
    }
    return { x: box.x + thickness, y: box.y, width: box.width - thickness, height: box.height };
  }
  const thickness = area / box.width;
  let x = box.x;
  for (const item of areas) {
    const width = item / thickness;
    output.push({ x, y: box.y, width, height: thickness });
    x += width;
  }
  return { x: box.x, y: box.y + thickness, width: box.width, height: box.height - thickness };
}

/**
 * Squarified treemap layout: places every weight in `box`, filling it completely, and keeps each rectangle as
 * close to square as a row-by-row pass allows. The result follows the input order, so callers sort first.
 */
function squarify(weights: readonly number[], box: TreemapBox): TreemapBox[] {
  const area = total(weights);
  if (weights.length === 0 || area <= 0 || box.width <= 0 || box.height <= 0) return [];
  const scale = (box.width * box.height) / area;
  const areas = weights.map((weight) => weight * scale);
  const output: TreemapBox[] = [];
  let remaining = box;
  let row: number[] = [];
  for (const item of areas) {
    const side = Math.min(remaining.width, remaining.height);
    if (row.length === 0 || worstRatio([...row, item], side) <= worstRatio(row, side)) {
      row.push(item);
      continue;
    }
    remaining = placeRow(row, remaining, output);
    row = [item];
  }
  if (row.length > 0) placeRow(row, remaining, output);
  return output;
}

function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "." : path.slice(0, index);
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index < 0 ? path : path.slice(index + 1);
}

/** The most severe finding in a group; `severityValues` runs least to most severe. */
function highestSeverity(counts: Record<Severity, number>): Severity {
  for (let index = severityValues.length - 1; index >= 0; index -= 1) {
    const severity = severityValues[index]!;
    if (counts[severity] > 0) return severity;
  }
  return "info";
}

function severityCounts(counts: Record<Severity, number>): string {
  return severityValues
    .slice()
    .reverse()
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${severity} ${counts[severity]}`)
    .join(", ");
}

/** One rectangle per file, except a directory past the limit, whose smallest files fold into one rectangle. */
function leavesOf(files: readonly FileNode[]): LeafInput[] {
  const ordered = [...files].sort((left, right) => right.weight - left.weight || compareText(left.path, right.path));
  const leaves = ordered.slice(0, TREEMAP_DIRECTORY_FILE_LIMIT).map<LeafInput>((file) => ({
    path: file.path,
    label: basename(file.path),
    severity: file.severity,
    weight: file.weight,
    findings: file.findings,
    counts: file.counts,
    hidden: 0,
  }));
  const folded = ordered.slice(TREEMAP_DIRECTORY_FILE_LIMIT);
  if (folded.length > 0) {
    const counts = emptyCounts();
    for (const file of folded) {
      for (const severity of severityValues) counts[severity] += file.counts[severity];
    }
    leaves.push({
      path: undefined,
      label: `${folded.length} more files`,
      severity: highestSeverity(counts),
      weight: total(folded.map((file) => file.weight)),
      findings: total(folded.map((file) => file.findings)),
      counts,
      hidden: folded.length,
    });
  }
  return leaves.sort((left, right) => right.weight - left.weight || compareText(left.path ?? left.label, right.path ?? right.label));
}

/** A stable element id for a file's section in the HTML report, so each rectangle can link to it. */
export function treemapFileId(path: string): string {
  return `file-${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;
}

/**
 * Lays findings out as a two-level treemap: one rectangle per directory, sized by the severity-weighted findings it
 * holds, then one rectangle per file inside it. Ordering is stable (weight descending, then path), so the same scan
 * always produces the same layout. Root-level files live in the `.` directory.
 */
export function layoutTreemap(findings: readonly TreemapFinding[], options: TreemapOptions = {}): TreemapLayout {
  const width = Number.isFinite(options.width) ? Math.max(320, Math.round(options.width!)) : TREEMAP_DEFAULT_WIDTH;
  const height = Number.isFinite(options.height) ? Math.max(160, Math.round(options.height!)) : TREEMAP_DEFAULT_HEIGHT;
  const byPath = new Map<string, FileNode>();
  for (const finding of findings) {
    const path = finding.location.path;
    const node = byPath.get(path) ?? { path, weight: 0, findings: 0, severity: "info", counts: emptyCounts() };
    node.counts[finding.severity] += 1;
    node.findings += 1;
    node.weight += TREEMAP_SEVERITY_WEIGHT[finding.severity];
    byPath.set(path, node);
  }
  const byDirectory = new Map<string, FileNode[]>();
  for (const node of byPath.values()) {
    node.severity = highestSeverity(node.counts);
    const directory = directoryOf(node.path);
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), node]);
  }
  const directories = [...byDirectory]
    .map(([path, files]) => ({ path, weight: total(files.map((file) => file.weight)), findings: total(files.map((file) => file.findings)), files }))
    .sort((left, right) => right.weight - left.weight || compareText(left.path, right.path));
  const boxes = squarify(directories.map((directory) => directory.weight), { x: 0, y: 0, width, height });
  return {
    width,
    height,
    findings: total([...byPath.values()].map((node) => node.findings)),
    files: byPath.size,
    directories: directories.map((directory, index) => {
      const box = boxes[index] ?? { x: 0, y: 0, width: 0, height: 0 };
      const leaves = leavesOf(directory.files);
      return {
        path: directory.path,
        weight: directory.weight,
        findings: directory.findings,
        ...box,
        leaves: placeLeaves(leaves, box),
      };
    }),
  };
}

const DIRECTORY_PAD = 2;
const DIRECTORY_HEADER = 14;
const LABELLED_DIRECTORY_WIDTH = 48;
const LABELLED_DIRECTORY_HEIGHT = 30;

function placeLeaves(leaves: readonly LeafInput[], directory: TreemapBox): TreemapLeaf[] {
  const labelled = directory.width >= LABELLED_DIRECTORY_WIDTH && directory.height >= LABELLED_DIRECTORY_HEIGHT;
  const top = labelled ? DIRECTORY_HEADER : DIRECTORY_PAD;
  const box = {
    x: directory.x + DIRECTORY_PAD,
    y: directory.y + top,
    width: Math.max(0, directory.width - DIRECTORY_PAD * 2),
    height: Math.max(0, directory.height - top - DIRECTORY_PAD),
  };
  const boxes = squarify(leaves.map((leaf) => leaf.weight), box);
  return leaves.map((leaf, index) => ({ ...leaf, ...(boxes[index] ?? box) }));
}

/** Escapes a value for SVG text or a quoted attribute. */
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

const coordinate = (value: number): string => String(Math.round(value * 100) / 100);

/** Cuts a label to the longest prefix that fits the rectangle at 10px, or nothing when it cannot be read. */
function fitLabel(text: string, width: number, size = 10): string | undefined {
  const max = Math.floor((width - 8) / (size * 0.62));
  if (max < 4) return undefined;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function cellTitle(leaf: TreemapLeaf, directory: string): string {
  const noun = leaf.findings === 1 ? "finding" : "findings";
  const subject = leaf.path ?? `${leaf.hidden} more files in ${directory}`;
  return `${subject}: ${leaf.findings} ${noun} (${severityCounts(leaf.counts)})`;
}

function renderLeaf(leaf: TreemapLeaf, directory: string): string {
  if (leaf.width < 1 || leaf.height < 1) return "";
  const title = cellTitle(leaf, directory);
  const label = leaf.width >= 44 && leaf.height >= 14 ? fitLabel(leaf.label, leaf.width) : undefined;
  const text = label === undefined ? "" : `<text x="${coordinate(leaf.x + 4)}" y="${coordinate(leaf.y + 12)}">${escape(label)}</text>`;
  const shape = `<rect class="tm-fill" x="${coordinate(leaf.x)}" y="${coordinate(leaf.y)}" width="${coordinate(leaf.width)}" height="${coordinate(leaf.height)}"/>`;
  if (leaf.path === undefined) {
    return `<g class="tm-cell ${leaf.severity} tm-collapsed" tabindex="0" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title>${shape}${text}</g>`;
  }
  return `<a class="tm-cell ${leaf.severity} tm-file" href="#${treemapFileId(leaf.path)}" tabindex="0"><title>${escape(title)}</title>${shape}${text}</a>`;
}

function paletteVariables(scheme: "light" | "dark"): string {
  return severityValues
    .map((severity) => `--tm-${severity}:${TREEMAP_PALETTE[scheme][severity].fill};--tm-${severity}-text:${TREEMAP_PALETTE[scheme][severity].text}`)
    .join(";");
}

const TREEMAP_STYLE = [
  `.evergreen-treemap{--tm-bg:#FFFFFF;--tm-frame:#d0d7de;--tm-label:#57606a;${paletteVariables("light")}}`,
  `@media (prefers-color-scheme:dark){.evergreen-treemap{--tm-bg:#0d1117;--tm-frame:#30363d;--tm-label:#8b949e;${paletteVariables("dark")}}}`,
  ".evergreen-treemap{font-family:Verdana,Geneva,DejaVu Sans,sans-serif}",
  ".evergreen-treemap text{font-size:10px}",
  ".evergreen-treemap .tm-fill{stroke:var(--tm-bg);stroke-width:1.5}",
  ".evergreen-treemap .tm-dir-frame{fill:none;stroke:var(--tm-frame)}",
  ".evergreen-treemap .tm-dir-label{fill:var(--tm-label);font-size:9px;font-weight:600}",
  ".evergreen-treemap .tm-cell:focus{outline:none}",
  ".evergreen-treemap .tm-cell:focus .tm-fill{stroke:var(--tm-label);stroke-width:2}",
  ...severityValues.map((severity) =>
    `.evergreen-treemap .tm-cell.${severity} .tm-fill{fill:var(--tm-${severity})}.evergreen-treemap .tm-cell.${severity} text{fill:var(--tm-${severity}-text)}`,
  ),
].join("\n");

function renderDirectory(directory: TreemapDirectory): string {
  if (directory.width < 1 || directory.height < 1) return "";
  const labelled = directory.width >= LABELLED_DIRECTORY_WIDTH && directory.height >= LABELLED_DIRECTORY_HEIGHT;
  const label = labelled ? fitLabel(directory.path, directory.width, 9) : undefined;
  return [
    `<g class="tm-dir">`,
    `<rect class="tm-dir-frame" x="${coordinate(directory.x)}" y="${coordinate(directory.y)}" width="${coordinate(directory.width)}" height="${coordinate(directory.height)}"/>`,
    ...(label === undefined ? [] : [`<text class="tm-dir-label" x="${coordinate(directory.x + 4)}" y="${coordinate(directory.y + 10)}">${escape(label)}</text>`]),
    ...directory.leaves.map((leaf) => renderLeaf(leaf, directory.path)),
    "</g>",
  ].join("");
}

/**
 * A self-contained SVG treemap of a scan: directories sized by the severity-weighted findings they hold, and files
 * inside them, colored by the file's most severe finding. Every file rectangle links to its section in the HTML report
 * and carries a tooltip with its path and counts. No script, fonts, or external references, so it renders under
 * `default-src 'none'`; light and dark colors follow `prefers-color-scheme`. Returns "" when there are no findings.
 */
export function renderTreemapSvg(findings: readonly TreemapFinding[], options: TreemapOptions = {}): string {
  const layout = layoutTreemap(findings, options);
  if (layout.directories.length === 0) return "";
  const description = `${layout.findings} findings across ${layout.files} files in ${layout.directories.length} directories. Areas are weighted by severity (critical 8, high 4, medium 2, low 1, info 0.5); color is the highest severity.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="treemap-title treemap-desc" class="evergreen-treemap">`,
    `<title id="treemap-title">Findings by file</title>`,
    `<desc id="treemap-desc">${escape(description)}</desc>`,
    `<style>${TREEMAP_STYLE}</style>`,
    `<rect class="tm-background" width="100%" height="100%" fill="var(--tm-bg)"/>`,
    ...layout.directories.map(renderDirectory),
    `</svg>`,
  ].join("");
}
