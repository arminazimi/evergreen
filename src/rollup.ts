import { readFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";

import { severityValues } from "./domain.js";
import type { ScanResult, Severity } from "./domain.js";

export class RollupError extends Error {}

export const UNOWNED = "unowned";

type SeverityCounts = Record<Severity, number>;

/** Findings counted by severity for one group, plus the repositories they come from. */
export interface RollupGroup {
  name: string;
  findings: number;
  repositories: string[];
  severities: SeverityCounts;
}

/** Findings and deadlines for one repository in the rollup. */
export interface RollupRepository {
  name: string;
  owner?: string;
  findings: number;
  severities: SeverityCounts;
  nearestDeadline?: string;
  deadlines: string[];
}

/** One deadline date and the repositories and findings due on that date. */
export interface RollupDeadline {
  deadline: string;
  findings: number;
  repositories: string[];
}

/** One summary of many repositories' scan reports, grouped by product and by owner. Deterministic: no clock, no network. */
export interface RollupResult {
  schemaVersion: "evergreen.rollup.v1";
  repositories: number;
  findings: number;
  severities: SeverityCounts;
  byProduct: RollupGroup[];
  byOwner: RollupGroup[];
  byRepository: RollupRepository[];
  deadlines: RollupDeadline[];
}

/** A repository's scan report and who owns it. */
export interface RollupInput {
  repository: string;
  owner?: string;
  report: Pick<ScanResult, "findings">;
}

/** Resolves repository name from a scan report file path or matrix artifact path. */
export function repositoryNameFromPath(path: string): string {
  const base = basename(path, extname(path));
  const raw = base === "evergreen-report" ? basename(dirname(path)) : base;
  return raw.startsWith("evergreen-report-") ? raw.slice("evergreen-report-".length) : raw;
}

/** The product a rule belongs to: the part of its ID before the first dot, such as `nodejs` in `nodejs.runtime.eol-18`. */
export function productOf(ruleId: string): string {
  const dot = ruleId.indexOf(".");
  return dot === -1 ? ruleId : ruleId.slice(0, dot);
}

function emptyCounts(): SeverityCounts {
  return Object.fromEntries(severityValues.map((severity) => [severity, 0])) as SeverityCounts;
}

function sortedGroups(groups: Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>): RollupGroup[] {
  return [...groups]
    .map(([name, group]) => ({ name, findings: group.findings, repositories: [...group.repositories].sort(), severities: group.severities }))
    .sort((left, right) => right.findings - left.findings || left.name.localeCompare(right.name));
}

/** Merges reports into one summary. The result does not depend on the order of `inputs`. */
export function rollup(inputs: readonly RollupInput[]): RollupResult {
  const severities = emptyCounts();
  const products = new Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>();
  const owners = new Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>();
  interface RepoAccumulator {
    owner?: string;
    findings: number;
    severities: SeverityCounts;
    deadlines: Set<string>;
  }
  const repoMap = new Map<string, RepoAccumulator>();
  const deadlineMap = new Map<string, { findings: number; repositories: Set<string> }>();

  const add = (groups: typeof products, name: string, repository: string, severity: Severity): void => {
    const group = groups.get(name) ?? { findings: 0, repositories: new Set<string>(), severities: emptyCounts() };
    group.findings += 1;
    group.repositories.add(repository);
    group.severities[severity] += 1;
    groups.set(name, group);
  };

  let findings = 0;
  for (const input of inputs) {
    let repo = repoMap.get(input.repository);
    if (!repo) {
      repo = {
        ...(input.owner !== undefined ? { owner: input.owner } : {}),
        findings: 0,
        severities: emptyCounts(),
        deadlines: new Set<string>(),
      };
      repoMap.set(input.repository, repo);
    } else if (repo.owner === undefined && input.owner !== undefined) {
      repo.owner = input.owner;
    }

    for (const finding of input.report.findings) {
      findings += 1;
      severities[finding.severity] += 1;
      repo.findings += 1;
      repo.severities[finding.severity] += 1;
      if (finding.deadline) {
        repo.deadlines.add(finding.deadline);
        const entry = deadlineMap.get(finding.deadline) ?? { findings: 0, repositories: new Set<string>() };
        entry.findings += 1;
        entry.repositories.add(input.repository);
        deadlineMap.set(finding.deadline, entry);
      }
      add(products, productOf(finding.ruleId), input.repository, finding.severity);
      add(owners, input.owner ?? UNOWNED, input.repository, finding.severity);
    }
  }

  const byRepository: RollupRepository[] = [...repoMap.entries()]
    .map(([name, repo]) => {
      const deadlines = [...repo.deadlines].sort();
      return {
        name,
        ...(repo.owner ? { owner: repo.owner } : {}),
        findings: repo.findings,
        severities: repo.severities,
        ...(deadlines.length > 0 ? { nearestDeadline: deadlines[0] } : {}),
        deadlines,
      };
    })
    .sort((left, right) => right.findings - left.findings || left.name.localeCompare(right.name));

  const deadlines: RollupDeadline[] = [...deadlineMap.entries()]
    .map(([deadline, entry]) => ({
      deadline,
      findings: entry.findings,
      repositories: [...entry.repositories].sort(),
    }))
    .sort((left, right) => left.deadline.localeCompare(right.deadline));

  return {
    schemaVersion: "evergreen.rollup.v1",
    repositories: repoMap.size,
    findings,
    severities,
    byProduct: sortedGroups(products),
    byOwner: sortedGroups(owners),
    byRepository,
    deadlines,
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new RollupError(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reads scan reports (`evergreen scan --json`) from files and merges them. A repository is named after its
 * report file or directory, so `payments.json` or `evergreen-report-payments.json` is `payments`.
 * `ownersFile` is a JSON object mapping repository names to owners.
 */
export async function rollupFiles(reportPaths: readonly string[], ownersFile?: string): Promise<RollupResult> {
  if (reportPaths.length === 0) throw new RollupError("Give at least one scan report (evergreen scan --json).");
  const owners = ownersFile === undefined ? {} : await readJson(ownersFile);
  if (typeof owners !== "object" || owners === null || Array.isArray(owners) || Object.values(owners).some((owner) => typeof owner !== "string" || owner === "")) {
    throw new RollupError(`${ownersFile} must be a JSON object mapping repository names to owner names.`);
  }
  const inputs: RollupInput[] = [];
  for (const path of reportPaths) {
    const report = (await readJson(path)) as Partial<ScanResult> | null;
    if (report?.schemaVersion !== "evergreen.scan.v1" || !Array.isArray(report.findings)) throw new RollupError(`${path} is not an evergreen.scan.v1 report.`);
    const repository = repositoryNameFromPath(path);
    const owner = (owners as Record<string, string>)[repository];
    inputs.push({ repository, ...(owner === undefined ? {} : { owner }), report: { findings: report.findings } });
  }
  return rollup(inputs);
}

export function renderRollupText(result: RollupResult): string {
  const lines = [`Evergreen rollup: ${result.findings} findings across ${result.repositories} repositories`];
  const section = (title: string, groups: RollupGroup[]): void => {
    if (groups.length === 0) return;
    lines.push("", `${title}:`);
    for (const group of groups) {
      const counts = [...severityValues].reverse().filter((severity) => group.severities[severity] > 0).map((severity) => `${group.severities[severity]} ${severity}`);
      lines.push(`  ${group.name}: ${group.findings} (${counts.join(", ")}) in ${group.repositories.join(", ")}`);
    }
  };
  if (result.byRepository.length > 0) {
    lines.push("", "By repository:");
    for (const repo of result.byRepository) {
      const counts = [...severityValues].reverse().filter((severity) => repo.severities[severity] > 0).map((severity) => `${repo.severities[severity]} ${severity}`);
      const deadline = repo.nearestDeadline ? `; nearest deadline ${repo.nearestDeadline}` : "";
      lines.push(`  ${repo.name}: ${repo.findings} (${counts.join(", ") || "0 findings"}${deadline})`);
    }
  }
  section("By product", result.byProduct);
  section("By owner", result.byOwner);
  return lines.join("\n");
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

const ROLLUP_HTML_STYLE = `body{font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0 auto;max-width:64rem;padding:2rem 1.5rem;color:#1b1f24;background:#fff}
h1{font-size:1.75rem;margin:0 0 .25rem}h2{font-size:1.25rem;margin:2rem 0 .5rem;padding-bottom:.3rem;border-bottom:1px solid #d0d7de}
.meta{color:#57606a;margin:0 0 1.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:2rem}
.card{border:1px solid #d0d7de;border-radius:6px;padding:1rem;text-align:center;background:#f6f8fa}
.card-num{font-size:1.75rem;font-weight:700;line-height:1.2}.card-label{font-size:.75rem;color:#57606a;text-transform:uppercase;font-weight:600;margin-top:.25rem}
table{width:100%;border-collapse:collapse;margin:1rem 0 2rem}th,td{text-align:left;padding:.65rem .75rem;border-bottom:1px solid #d0d7de}
th{background:#f6f8fa;font-weight:600;font-size:.85rem}tr:hover{background:#f6f8fa80}
.badge{display:inline-block;font-size:.75rem;font-weight:600;text-transform:uppercase;padding:.15rem .45rem;border-radius:4px;margin-right:.35rem}
.critical,.high{background:#ffebe9;color:#cf222e;border:1px solid #ff818266}.medium{background:#fff8c5;color:#9a6700;border:1px solid #d4a72c66}
.low,.info{background:#ddf4ff;color:#0969da;border:1px solid #54aeff66}.clean{background:#dafbe1;color:#1a7f37;border:1px solid #4ac26b66}
code{font-family:ui-monospace,monospace;background:#f6f8fa;padding:.1rem .35rem;border-radius:3px;font-size:.9em}
time{font-family:ui-monospace,monospace;font-size:.9em}
@media (prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}h1,h2{color:#e6edf3}h2{border-bottom-color:#30363d}.meta{color:#8b949e}
.card,th,td{border-color:#30363d}.card{background:#161b22}th{background:#161b22}tr:hover{background:#161b2280}code{background:#161b22}.card-label{color:#8b949e}
.critical,.high{background:#490202;color:#ff7b72;border-color:#f8514966}.medium{background:#341a00;color:#d29922;border-color:#bb800966}
.low,.info{background:#03224c;color:#58a6ff;border-color:#388bfd66}.clean{background:#04260f;color:#3fb950;border-color:#2ea04366}}`;

function severityBadges(severities: SeverityCounts): string {
  const parts: string[] = [];
  for (const severity of [...severityValues].reverse()) {
    const count = severities[severity];
    if (count > 0) parts.push(`<span class="badge ${severity}">${count} ${severity}</span>`);
  }
  return parts.length > 0 ? parts.join("") : `<span class="badge clean">clean</span>`;
}

/**
 * Renders rollup results as a self-contained static HTML page for GitHub Pages: inline styles,
 * no external requests, no scripts (CSP enforces this), and deterministic layout.
 */
export function renderRollupHtml(result: RollupResult): string {
  const data = JSON.stringify(result, null, 2).replace(/</g, "\\u003c");

  const repoRows = result.byRepository.map((repo) => {
    const owner = repo.owner ? escapeHtml(repo.owner) : `<span class="meta">${UNOWNED}</span>`;
    const deadline = repo.nearestDeadline ? `<time datetime="${escapeHtml(repo.nearestDeadline)}">${escapeHtml(repo.nearestDeadline)}</time>` : `<span class="meta">&mdash;</span>`;
    return [
      "<tr>",
      `  <td><code>${escapeHtml(repo.name)}</code></td>`,
      `  <td>${owner}</td>`,
      `  <td><strong>${repo.findings}</strong></td>`,
      `  <td>${severityBadges(repo.severities)}</td>`,
      `  <td>${deadline}</td>`,
      "</tr>",
    ].join("\n");
  });

  const deadlineRows = result.deadlines.map((dl) => {
    const repos = dl.repositories.map((r) => `<code>${escapeHtml(r)}</code>`).join(", ");
    return [
      "<tr>",
      `  <td><time datetime="${escapeHtml(dl.deadline)}">${escapeHtml(dl.deadline)}</time></td>`,
      `  <td><strong>${dl.findings}</strong></td>`,
      `  <td>${repos}</td>`,
      "</tr>",
    ].join("\n");
  });

  const productRows = result.byProduct.map((group) => {
    const repos = group.repositories.map((r) => `<code>${escapeHtml(r)}</code>`).join(", ");
    return [
      "<tr>",
      `  <td><code>${escapeHtml(group.name)}</code></td>`,
      `  <td><strong>${group.findings}</strong></td>`,
      `  <td>${repos}</td>`,
      `  <td>${severityBadges(group.severities)}</td>`,
      "</tr>",
    ].join("\n");
  });

  const ownerRows = result.byOwner.map((group) => {
    const repos = group.repositories.map((r) => `<code>${escapeHtml(r)}</code>`).join(", ");
    return [
      "<tr>",
      `  <td><strong>${escapeHtml(group.name)}</strong></td>`,
      `  <td><strong>${group.findings}</strong></td>`,
      `  <td>${repos}</td>`,
      `  <td>${severityBadges(group.severities)}</td>`,
      "</tr>",
    ].join("\n");
  });

  const sections: string[] = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    "<title>Evergreen rollup report</title>",
    `<style>${ROLLUP_HTML_STYLE}</style>`,
    "</head>",
    "<body>",
    "<h1>Evergreen rollup report</h1>",
    `<p class="meta">${result.repositories} repositories &bull; ${result.findings} findings</p>`,
    '<div class="grid">',
    `  <div class="card"><div class="card-num">${result.repositories}</div><div class="card-label">Repositories</div></div>`,
    `  <div class="card"><div class="card-num">${result.findings}</div><div class="card-label">Findings</div></div>`,
    `  <div class="card"><div class="card-num">${result.severities.critical + result.severities.high}</div><div class="card-label">Critical &amp; High</div></div>`,
    `  <div class="card"><div class="card-num">${result.severities.medium}</div><div class="card-label">Medium</div></div>`,
    `  <div class="card"><div class="card-num">${result.severities.low + result.severities.info}</div><div class="card-label">Low &amp; Info</div></div>`,
    "</div>",
    "<h2>Repositories</h2>",
    "<table>",
    "<thead><tr><th>Repository</th><th>Owner</th><th>Findings</th><th>Severities</th><th>Nearest deadline</th></tr></thead>",
    "<tbody>",
    ...repoRows,
    "</tbody>",
    "</table>",
  ];

  if (deadlineRows.length > 0) {
    sections.push(
      "<h2>Upcoming deadlines</h2>",
      "<table>",
      "<thead><tr><th>Deadline</th><th>Findings</th><th>Affected repositories</th></tr></thead>",
      "<tbody>",
      ...deadlineRows,
      "</tbody>",
      "</table>",
    );
  }

  if (productRows.length > 0) {
    sections.push(
      "<h2>By product</h2>",
      "<table>",
      "<thead><tr><th>Product</th><th>Findings</th><th>Repositories</th><th>Severities</th></tr></thead>",
      "<tbody>",
      ...productRows,
      "</tbody>",
      "</table>",
    );
  }

  if (ownerRows.length > 0) {
    sections.push(
      "<h2>By owner</h2>",
      "<table>",
      "<thead><tr><th>Owner</th><th>Findings</th><th>Repositories</th><th>Severities</th></tr></thead>",
      "<tbody>",
      ...ownerRows,
      "</tbody>",
      "</table>",
    );
  }

  sections.push(
    `<script type="application/json" id="evergreen-rollup">${data}</script>`,
    "</body>",
    "</html>",
  );

  return sections.join("\n");
}
