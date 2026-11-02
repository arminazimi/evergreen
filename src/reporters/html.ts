import type { Finding, ScanResult, Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import type { Forecast } from "../forecast.js";
import { renderForecastSvg } from "../forecast-svg.js";
import { renderTreemapSvg, treemapFileId } from "../treemap.js";
import { renderJson } from "./json.js";
import { describeData, findingOrder } from "./shared.js";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes a value for HTML text or a quoted attribute. Every value in the HTML report goes through this. */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const HTML_STYLE = `:root{color-scheme:light dark}
*{box-sizing:border-box}
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1.5rem;color:#1b1f24;background:#fff}
h1{margin:0 0 .25rem;font-size:1.75rem}h2{font-size:1.15rem;margin:1.5rem 0 .5rem}
h3{font-size:1rem;font-weight:600;margin:.25rem 0 .5rem}h4{font-size:1rem;margin:0 0 .25rem}
.meta{color:#57606a;margin:0 0 1rem}
.summary table{width:100%;border-collapse:collapse;margin:0 0 1rem}
.summary th,.summary td{padding:.4rem .5rem;text-align:center;border:1px solid #d0d7de;font-variant-numeric:tabular-nums}
.summary th{font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#57606a}
.summary td{font-size:1.35rem;font-weight:600}
.summary td.critical,.summary td.high{color:#cf222e}.summary td.medium{color:#bf8700}.summary td.low,.summary td.info{color:#0969da}
article{border:1px solid #d0d7de;border-left-width:6px;border-radius:6px;padding:.75rem 1rem;margin:0 0 .75rem}
article.critical,article.high{border-left-color:#cf222e}article.medium{border-left-color:#bf8700}article.low,article.info{border-left-color:#0969da}
.badge{display:inline-block;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;margin-right:.5rem;padding:0 .4rem;border-radius:3px}
.critical .badge,.high .badge{background:#ffebe9;color:#cf222e}.medium .badge{background:#fff8c5;color:#9a6700}.low .badge,.info .badge{background:#ddf4ff;color:#0969da}
dl{margin:.5rem 0 0}dt{font-weight:600}dd{margin:0 0 .25rem}
code{font-family:ui-monospace,monospace;background:#f6f8fa;padding:0 .25rem;border-radius:3px}
@media (prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}.meta,.summary th{color:#8b949e}
.summary th,.summary td,article{border-color:#30363d}
.summary td.critical,.summary td.high{color:#ff7b72}.summary td.medium{color:#d29922}.summary td.low,.summary td.info{color:#58a6ff}
article.critical,article.high{border-left-color:#ff7b72}article.medium{border-left-color:#d29922}article.low,article.info{border-left-color:#58a6ff}
.critical .badge,.high .badge{background:#67060c;color:#ff7b72}.medium .badge{background:#3b2300;color:#d29922}.low .badge,.info .badge{background:#0c2d6b;color:#79c0ff}
code{background:#161b22;color:#e6edf3}a{color:#58a6ff}}
@media print{body{max-width:none;padding:0;color:#000;background:#fff;font-size:12px}
a{color:#000;text-decoration:none}a[href^="https://"]::after{content:" (" attr(href) ")";font-size:.85em}
article,.summary{break-inside:avoid}h1,h2,h3,h4{break-after:avoid}}`;

const HTML_FORECAST_STYLE = `
section.forecast{margin:0 0 1.5rem}section.forecast svg{max-width:100%;height:auto}
section.forecast ul{margin:.5rem 0 0;padding-left:1.25rem}section.forecast li{margin:0 0 .25rem}
@media print{section.forecast{break-inside:avoid}}`;

const HTML_TREEMAP_STYLE = `
section.treemap{margin:0 0 1.5rem}section.treemap svg{max-width:100%;height:auto}
@media print{section.treemap{break-inside:avoid}}`;

function htmlLocation(location: { path: string; line?: number }): string {
  return `${location.path}${location.line ? `:${location.line}` : ""}`;
}

function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** An evidence link is clickable only for HTTPS URLs; any other value is shown as plain text. */
function htmlSource(source: { title: string; url: string }): string {
  const title = escapeHtml(source.title);
  const url = `<code>${escapeHtml(source.url)}</code>`;
  return /^https:\/\//i.test(source.url) ? `<a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${title}</a> ${url}` : `${title} ${url}`;
}

function htmlFinding(finding: Finding): string {
  const rows: Array<[string, string]> = [
    ["Location", `<code>${escapeHtml(htmlLocation(finding.location))}</code>`],
    ["Rule", `<code>${escapeHtml(finding.ruleId)}</code> (detector ${escapeHtml(finding.detector)})`],
    ["Confidence", escapeHtml(finding.confidence)],
  ];
  if (finding.dependencyPath) rows.push(["Path", escapeHtml(finding.dependencyPath.join(" > "))]);
  if (finding.replacement) rows.push(["Replacement", escapeHtml(finding.replacement)]);
  if (finding.deadline) rows.push(["Deadline", escapeHtml(finding.deadline)]);
  if (finding.impact) rows.push(["Impact", escapeHtml(`${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`)]);
  for (const usage of finding.usages ?? []) rows.push(["Usage", `<code>${escapeHtml(htmlLocation(usage.location))}</code> ${escapeHtml(usage.kind)} ${escapeHtml(usage.symbol)}`]);
  for (const step of finding.migration?.steps ?? []) rows.push(["Migration", `${escapeHtml(step.title)}: ${escapeHtml(step.instructions)}`]);
  for (const item of finding.migration?.verification ?? []) rows.push(["Verify", `<code>${escapeHtml(item.command)}</code> ${escapeHtml(item.purpose)}`]);
  for (const source of finding.sources) rows.push(["Source", htmlSource(source)]);
  return [
    `<article class="${escapeHtml(finding.severity)}" id="${escapeHtml(finding.id)}">`,
    `<h4><span class="badge">${escapeHtml(severityLabel(finding.severity))}</span>${escapeHtml(finding.title)}</h4>`,
    `<p>${escapeHtml(finding.summary)}</p>`,
    `<dl>${rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join("")}</dl>`,
    "</article>",
  ].join("\n");
}

/** One row of counts per severity, most severe first, so the shape of the scan is readable before any detail. */
function htmlSummary(findings: readonly Finding[]): string {
  const severities = severityValues.slice().reverse();
  const count = (severity: Severity) => findings.filter((finding) => finding.severity === severity).length;
  return [
    '<section class="summary">',
    "<h2>Summary</h2>",
    "<table>",
    `<thead><tr>${severities.map((severity) => `<th scope="col">${severityLabel(severity)}</th>`).join("")}</tr></thead>`,
    `<tbody><tr>${severities.map((severity) => `<td class="${severity}">${count(severity)}</td>`).join("")}</tr></tbody>`,
    "</table>",
    "</section>",
  ].join("\n");
}

/** A timeline of the coming months, plus the same events as text for readers without SVG. */
function htmlForecast(forecast: Forecast): string {
  const events = forecast.groups.flatMap((group) => group.events);
  const summary = `${forecast.total} event${forecast.total === 1 ? "" : "s"} from ${forecast.today} to ${forecast.until}, ${forecast.affecting} affecting this repository`;
  const items = events.map((event) => {
    const affects = event.findings.length === 0
      ? "does not affect this repository"
      : `affects ${event.findings.length} finding${event.findings.length === 1 ? "" : "s"}`;
    return `<li class="${escapeHtml(event.severity)}"><code>${escapeHtml(event.date)}</code> <span class="badge">${escapeHtml(severityLabel(event.severity))}</span> ${escapeHtml(event.title)} — ${escapeHtml(affects)} <code>${escapeHtml(event.ruleId)}</code></li>`;
  });
  return [
    '<section class="forecast">',
    `<h2>Next ${forecast.months} months</h2>`,
    `<p class="meta">${escapeHtml(summary)}</p>`,
    renderForecastSvg(forecast),
    ...(items.length === 0 ? ["<p>Nothing in this window reaches a dated end of life.</p>"] : [`<ul>${items.join("")}</ul>`]),
    "</section>",
  ].join("\n");
}

/**
 * Directories and files sized by severity-weighted finding count, so the largest risk surfaces first. Each rectangle
 * links to the matching file section below.
 */
function htmlTreemap(findings: readonly Finding[]): string {
  return [
    '<section class="treemap">',
    "<h2>Findings by file</h2>",
    '<p class="meta">Areas are sized by severity-weighted finding count (critical 8, high 4, medium 2, low 1, info 0.5); color is the highest severity. Select a rectangle to jump to its findings.</p>',
    renderTreemapSvg(findings),
    "</section>",
  ].join("\n");
}

/**
 * Findings grouped by severity, most severe first, and then by path, using the same deterministic order as the
 * machine-readable reporters. Only the page order changes: the embedded JSON stays exactly the JSON report. The first
 * section for a path gets the id the treemap links to, so a file with findings at several severities keeps one id.
 */
function htmlGroups(findings: readonly Finding[]): string {
  const ordered = [...findings].sort(findingOrder);
  const lines: string[] = [];
  const linked = new Set<string>();
  for (const severity of severityValues.slice().reverse()) {
    const inSeverity = ordered.filter((finding) => finding.severity === severity);
    if (inSeverity.length === 0) continue;
    lines.push(`<section class="severity ${severity}">`);
    lines.push(`<h2><span class="badge">${severityLabel(severity)}</span>${inSeverity.length} finding${inSeverity.length === 1 ? "" : "s"}</h2>`);
    for (const path of new Set(inSeverity.map((finding) => finding.location.path))) {
      lines.push(linked.has(path) ? '<section class="path">' : `<section class="path" id="${treemapFileId(path)}">`);
      linked.add(path);
      lines.push(`<h3><code>${escapeHtml(path)}</code></h3>`);
      lines.push(...inSeverity.filter((finding) => finding.location.path === path).map(htmlFinding));
      lines.push("</section>");
    }
    lines.push("</section>");
  }
  return lines.join("\n");
}

export interface HtmlOptions {
  /** When given, the page leads with a "Next N months" timeline above the findings. */
  forecast?: Forecast | undefined;
}

/**
 * Renders a scan as one self-contained HTML file for sharing without a terminal or Code Scanning: inline styles, no
 * scripts, and no external requests (a CSP forbids them). Every value is escaped. The full JSON report is embedded as an
 * inert data block, so the page and `--format json` always describe the same scan. The visible page groups findings by
 * severity and path and leads with a treemap of findings by file; the embedded JSON keeps the JSON report's own order.
 * Without {@link HtmlOptions.forecast} the output is exactly what it was before the option existed.
 */
export function renderHtml(result: ScanResult, options: HtmlOptions = {}): string {
  // "<" is escaped so no value can close the data block; JSON.parse reads the text back to the exact JSON report.
  const data = renderJson(result).replace(/</g, "\\u003c");
  const count = result.findings.length;
  const meta = [`Repository: ${result.root}`, `Scanned: ${result.scannedAt}`, ...(result.data ? [describeData(result.data)] : [])];
  const notes = result.diagnostics.map((diagnostic) => `<p class="meta">Note: ${escapeHtml(diagnostic)}</p>`);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    "<title>Evergreen report</title>",
    `<style>${HTML_STYLE}${HTML_TREEMAP_STYLE}${options.forecast ? HTML_FORECAST_STYLE : ""}</style>`,
    "</head>",
    "<body>",
    "<h1>Evergreen report</h1>",
    `<p class="meta">${meta.map(escapeHtml).join("<br>")}</p>`,
    `<p><strong>${count} finding${count === 1 ? "" : "s"}</strong></p>`,
    htmlSummary(result.findings),
    ...(count === 0 ? [] : [htmlTreemap(result.findings)]),
    ...(options.forecast ? [htmlForecast(options.forecast)] : []),
    ...(count === 0 ? ['<p class="meta">No lifecycle risks found.</p>'] : [htmlGroups(result.findings)]),
    ...notes,
    `<script type="application/json" id="evergreen-report">${data}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
