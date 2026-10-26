import { createHash } from "node:crypto";

import type { DependencyCheck } from "./check-dependency.js";
import type { DataInfo, Finding, ScanResult, Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import type { MigrationPacket, UpgradePath } from "./migration-packet.js";
import { VERSION } from "./version.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Escapes untrusted text for a Markdown table cell while keeping the report on one physical line per row. */
function escapeMarkdown(value: string | number): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "|": "&#124;",
    "\\": "&#92;",
  };
  return String(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line.replace(/[&<>|\\\x60*_{}\[\]()#+\-.!]/g, (character) =>
        escapes[character] ?? "\\" + character,
      ),
    )
    .join("<br>");
}

/** Only trusted web schemes become Markdown links; unsafe or malformed URLs stay plain text. */
function markdownSource(source: { title: string; url: string }): string {
  const title = escapeMarkdown(source.title);
  try {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return title + " (" + escapeMarkdown(source.url) + ")";
    const destination = url.href.replace(/[()<>\s]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
    return "[" + title + "](" + destination + ")";
  } catch {
    return title + " (" + escapeMarkdown(source.url) + ")";
  }
}

/**
 * Renders a paste-ready Markdown report with a stable table and evidence links.
 * Findings use the same deterministic location/rule ordering as the machine-readable reporters.
 * All finding-controlled text is escaped, and only HTTP(S) evidence URLs become links.
 */
export function renderMarkdown(result: ScanResult): string {
  const findings = [...result.findings].sort(findingOrder);
  const lines = [
    "# Evergreen scan report",
    "",
    "- **Repository:** " + escapeMarkdown(result.root),
    "- **Scanned:** " + escapeMarkdown(result.scannedAt),
    "- **Findings:** " + findings.length,
    ...(result.data ? ["- " + escapeMarkdown(describeData(result.data))] : []),
    "",
    "## Findings",
    "",
    "| Severity | Finding | Location | Summary | Replacement | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(findings.length === 0
      ? ["| — | No findings | — | No lifecycle risks found. | — | — |"]
      : findings.map((finding) => {
          const location = finding.location.line
            ? finding.location.path + ":" + finding.location.line
            : finding.location.path;
          const evidence = finding.sources.length > 0
            ? finding.sources.map(markdownSource).join("<br>")
            : "—";
          return "| " + escapeMarkdown(finding.severity) + " | " + escapeMarkdown(finding.title) + " | " +
            escapeMarkdown(location) + " | " + escapeMarkdown(finding.summary) + " | " +
            escapeMarkdown(finding.replacement ?? "—") + " | " + evidence + " |";
        })),
  ];
  if (result.diagnostics.length > 0) {
    lines.push("", "## Notes", "", ...result.diagnostics.map((diagnostic) => "- " + escapeMarkdown(diagnostic)));
  }
  return lines.join("\n");
}

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

/** Help for a rule in code scanning: what to move to, by when, how, and the evidence behind the claim. */
function sarifHelp(finding: Finding): { text: string; markdown: string } {
  const text: string[] = [finding.title];
  const markdown: string[] = [`**${finding.title}**`];
  const add = (plain: string, rich = plain) => {
    text.push(plain);
    markdown.push(rich);
  };
  if (finding.replacement) add(`Replacement: ${finding.replacement}`, `**Replacement:** ${finding.replacement}`);
  if (finding.deadline) add(`Deadline: ${finding.deadline}`, `**Deadline:** ${finding.deadline}`);
  const migration = finding.migration;
  if (migration && migration.steps.length > 0) {
    const steps = migration.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.instructions}`);
    add(["Migration:", ...steps].join("\n"), ["**Migration**", "", ...steps].join("\n"));
  }
  if (migration && migration.verification.length > 0) {
    add(
      ["Verify:", ...migration.verification.map((item) => `- ${item.command} (${item.purpose})`)].join("\n"),
      ["**Verify**", "", ...migration.verification.map((item) => `- \`${item.command}\`: ${item.purpose}`)].join("\n"),
    );
  }
  if (finding.sources.length > 0) {
    add(
      ["Sources:", ...finding.sources.map((source) => `- ${source.title}: ${source.url}`)].join("\n"),
      ["**Sources**", "", ...finding.sources.map((source) => `- [${source.title}](${source.url})`)].join("\n"),
    );
  }
  return { text: text.join("\n\n"), markdown: markdown.join("\n\n") };
}

/** One line saying which lifecycle data a result used and how fresh its evidence is. */
export function describeData(data: DataInfo): string {
  const age = data.ageDays === 0 ? "today" : `${data.ageDays} day${data.ageDays === 1 ? "" : "s"} ago`;
  return `Data: ${data.source} ${data.version}, evidence reviewed through ${data.reviewedThrough} (${age})${data.stale ? ", stale" : ""}`;
}

const RDJSON_SEVERITY: Record<Severity, "ERROR" | "WARNING" | "INFO"> = {
  critical: "ERROR",
  high: "ERROR",
  medium: "WARNING",
  low: "INFO",
  info: "INFO",
};

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** The one order every machine-readable reporter uses, so the same scan always lists findings the same way. */
function findingOrder(left: Finding, right: Finding): number {
  return (
    compare(left.location.path, right.location.path) ||
    (left.location.line ?? 0) - (right.location.line ?? 0) ||
    compare(left.ruleId, right.ruleId) ||
    compare(left.id, right.id)
  );
}

/**
 * Renders a scan as one SARIF 2.1.0 run. Output is deterministic: rules and results are sorted, paths are
 * repository-relative with forward slashes, and nothing machine-specific (root, time) is included. Only
 * locations and Evergreen's own rule text are written; no source content is uploaded.
 */
export function renderSarif(result: ScanResult): string {
  const findings = [...result.findings].sort(findingOrder);
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))].sort(compare);
  const rules = ruleIds.map((ruleId) => {
    const finding = findings.find((candidate) => candidate.ruleId === ruleId)!;
    return {
      id: ruleId,
      name: ruleId,
      shortDescription: { text: finding.title },
      help: sarifHelp(finding),
      ...(finding.sources[0] ? { helpUri: finding.sources[0].url } : {}),
      defaultConfiguration: { level: SARIF_LEVEL[finding.severity] },
      properties: { tags: ["lifecycle", finding.detector] },
    };
  });

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Evergreen",
            version: VERSION,
            informationUri: "https://github.com/arminazimi/evergreen",
            rules,
          },
        },
        // Only fixed facts about the data are written, so the same data always gives the same file.
        ...(result.data ? { properties: { evergreenData: { source: result.data.source, version: result.data.version, reviewedThrough: result.data.reviewedThrough } } } : {}),
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          ruleIndex: ruleIds.indexOf(finding.ruleId),
          level: SARIF_LEVEL[finding.severity],
          message: { text: finding.summary },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.location.path, uriBaseId: "%SRCROOT%" },
                ...(finding.location.line ? { region: { startLine: finding.location.line } } : {}),
              },
            },
          ],
          partialFingerprints: { "evergreenFindingId/v1": finding.id },
          properties: { confidence: finding.confidence },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

/**
 * Renders a scan as one reviewdog Diagnostic Format (rdjson) result, the input `reviewdog -f=rdjson` reads. Findings use
 * the same order as SARIF. Lines and columns are written only when the finding has them, and only Evergreen's own rule
 * text and locations are included. Like SARIF, the output has no root path or timestamp, so it is deterministic.
 */
export function renderRdjson(result: ScanResult): string {
  const diagnostics = [...result.findings].sort(findingOrder).map((finding) => {
    const { line, column } = finding.location;
    return {
      message: finding.summary,
      location: {
        path: finding.location.path,
        ...(line ? { range: { start: { line, ...(column ? { column } : {}) } } } : {}),
      },
      severity: RDJSON_SEVERITY[finding.severity],
      code: {
        value: finding.ruleId,
        ...(finding.sources[0] ? { url: finding.sources[0].url } : {}),
      },
    };
  });
  const rdjson = {
    source: { name: "Evergreen", url: "https://github.com/arminazimi/evergreen" },
    diagnostics,
  };
  return JSON.stringify(rdjson, null, 2);
}

const CODE_QUALITY_SEVERITY: Record<Severity, "blocker" | "critical" | "major" | "minor" | "info"> = {
  critical: "blocker",
  high: "critical",
  medium: "major",
  low: "minor",
  info: "info",
};

/**
 * Renders a scan as a GitLab Code Quality report (the CodeClimate-style JSON array GitLab shows in merge requests).
 * Findings use the same order as SARIF. The fingerprint is a hash of the finding ID, so GitLab can match the same
 * finding across pipelines. A finding without a line is reported at line 1, which GitLab requires. Like SARIF, the
 * output has no root path or timestamp, so it is deterministic.
 */
export function renderCodeQuality(result: ScanResult): string {
  const issues = [...result.findings].sort(findingOrder).map((finding) => ({
    description: finding.summary,
    check_name: finding.ruleId,
    fingerprint: createHash("sha256").update(finding.id).digest("hex"),
    severity: CODE_QUALITY_SEVERITY[finding.severity],
    location: { path: finding.location.path, lines: { begin: finding.location.line ?? 1 } },
  }));
  return JSON.stringify(issues, null, 2);
}

/** The most findings a chat or webhook message lists. The rest are counted, not listed, so one message stays small. */
export const CHAT_MAX_FINDINGS = 20;
/** Slack's documented limit for the text of one section block, in characters. */
const SLACK_SECTION_MAX = 3000;

/** The findings most severe first, in the same order `--format compact` uses. */
function sortedFindings(result: ScanResult): Finding[] {
  return [...result.findings].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || findingOrder(left, right));
}

/** One line of counts, such as "Evergreen: 3 findings (high 2, low 1)". It names no path and no time, so it is deterministic. */
function chatHeadline(findings: Finding[]): string {
  if (findings.length === 0) return "Evergreen: no lifecycle risks found";
  const counts = severityValues
    .slice()
    .reverse()
    .map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length] as const)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${severity} ${count}`);
  return `Evergreen: ${findings.length} finding${findings.length === 1 ? "" : "s"} (${counts.join(", ")})`;
}

function findingLocation(finding: Finding): string {
  return finding.location.line ? `${finding.location.path}:${finding.location.line}` : finding.location.path;
}

/** Slack mrkdwn treats `&`, `<` and `>` as control characters, so only those three are escaped. */
function escapeSlack(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escapes `text` for a Slack section of at most `max` characters, ending in "…" when it is cut. The cut is made on the
 * raw text and the result is escaped afterwards, so it never splits an entity such as `&amp;` in half.
 */
function clipSlack(text: string, max: number): string {
  const escaped = escapeSlack(text);
  if (escaped.length <= max) return escaped;
  // Escaping only grows text, so the kept prefix is at most max - 1 raw characters; shrink until it and "…" fit.
  let end = Math.min(text.length, max - 1);
  while (escapeSlack(text.slice(0, end)).length + 1 > max) end--;
  return `${escapeSlack(text.slice(0, end))}…`;
}

/**
 * Renders a scan as a Slack incoming-webhook message: a header, a counts summary, and one section per finding, most
 * severe first, capped at {@link CHAT_MAX_FINDINGS}. The top-level `text` is the fallback Slack shows in notifications.
 * It only renders the payload; nothing is sent.
 */
export function renderSlack(result: ScanResult): string {
  const findings = sortedFindings(result);
  const headline = chatHeadline(findings);
  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: "Evergreen lifecycle scan", emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: escapeSlack(headline) } },
    ...findings.slice(0, CHAT_MAX_FINDINGS).map((finding) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: clipSlack(
          `*${finding.severity}* ${finding.title}\n${findingLocation(finding)}\n${finding.summary}` +
            (finding.replacement ? `\nReplacement: ${finding.replacement}` : ""),
          SLACK_SECTION_MAX,
        ),
      },
    })),
  ];
  const omitted = findings.length - CHAT_MAX_FINDINGS;
  if (omitted > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: escapeSlack(`${omitted} more finding${omitted === 1 ? "" : "s"} omitted; use --format json for all.`) }] });
  }
  return JSON.stringify({ text: headline, blocks }, null, 2);
}

/**
 * Renders a scan as a Microsoft Teams message: an Adaptive Card (version 1.4, which Teams workflow webhooks accept)
 * with a header, a counts summary, and one block per finding, capped at {@link CHAT_MAX_FINDINGS}. Finding text goes
 * through {@link escapeMarkdown} because Adaptive TextBlocks render Markdown. It only renders the payload; nothing is sent.
 */
export function renderTeams(result: ScanResult): string {
  const findings = sortedFindings(result);
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: "Evergreen lifecycle scan", weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: escapeMarkdown(chatHeadline(findings)), wrap: true },
    ...findings.slice(0, CHAT_MAX_FINDINGS).flatMap((finding) => [
      {
        type: "TextBlock",
        text: escapeMarkdown(`${finding.severity}: ${finding.title} (${findingLocation(finding)})`),
        weight: "Bolder",
        wrap: true,
        separator: true,
      },
      { type: "TextBlock", text: escapeMarkdown(finding.summary), wrap: true, isSubtle: true, spacing: "None" },
    ]),
  ];
  const omitted = findings.length - CHAT_MAX_FINDINGS;
  if (omitted > 0) {
    body.push({ type: "TextBlock", text: escapeMarkdown(`${omitted} more finding${omitted === 1 ? "" : "s"} omitted; use --format json for all.`), wrap: true, isSubtle: true });
  }
  const message = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body },
      },
    ],
  };
  return JSON.stringify(message, null, 2);
}

/** The schema tag of the generic webhook payload. Consumers can check it before reading the rest. */
export const WEBHOOK_SCHEMA_VERSION = "evergreen.webhook.v1";

/**
 * Renders a scan as a generic webhook payload for any system that accepts JSON: the schema tag, the scan time, a count
 * per severity (zeros included, so the shape never changes), and every finding with its rule, location, replacement,
 * deadline, and evidence. Findings are ordered like the other machine-readable reporters, so the same scan always renders the same bytes.
 */
export function renderWebhook(result: ScanResult): string {
  const findings = sortedFindings(result);
  const payload = {
    schemaVersion: WEBHOOK_SCHEMA_VERSION,
    source: "evergreen",
    scannedAt: result.scannedAt,
    summary: {
      findings: findings.length,
      bySeverity: Object.fromEntries(severityValues.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])),
    },
    findings: findings.map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      location: finding.location,
      ...(finding.replacement ? { replacement: finding.replacement } : {}),
      ...(finding.deadline ? { deadline: finding.deadline } : {}),
      sources: finding.sources,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes a value for HTML text or a quoted attribute. Every value in the HTML report goes through this. */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

const HTML_STYLE = `body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1.5rem;color:#1b1f24;background:#fff}
h1{margin:0 0 .25rem}.meta{color:#57606a;margin:0 0 1.5rem}
article{border:1px solid #d0d7de;border-left-width:6px;border-radius:6px;padding:.75rem 1rem;margin:0 0 1rem}
article h2{font-size:1.05rem;margin:0 0 .25rem}.critical,.high{border-left-color:#cf222e}.medium{border-left-color:#bf8700}.low,.info{border-left-color:#0969da}
.badge{font-size:.75rem;font-weight:600;text-transform:uppercase;margin-right:.5rem}dl{margin:.5rem 0 0}dt{font-weight:600}dd{margin:0 0 .25rem}
code{font-family:ui-monospace,monospace;background:#f6f8fa;padding:0 .25rem;border-radius:3px}
@media (prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}.meta{color:#8b949e}article{border-color:#30363d}code{background:#161b22}}`;

function htmlLocation(location: { path: string; line?: number }): string {
  return `${location.path}${location.line ? `:${location.line}` : ""}`;
}

/** An evidence link is clickable only for http(s) URLs; any other value is shown as plain text. */
function htmlSource(source: { title: string; url: string }): string {
  const title = escapeHtml(source.title);
  return /^https?:\/\//i.test(source.url) ? `<a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${title}</a> <code>${escapeHtml(source.url)}</code>` : `${title} <code>${escapeHtml(source.url)}</code>`;
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
    `<h2><span class="badge">${escapeHtml(finding.severity)}</span>${escapeHtml(finding.title)}</h2>`,
    `<p>${escapeHtml(finding.summary)}</p>`,
    `<dl>${rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join("")}</dl>`,
    "</article>",
  ].join("\n");
}

/**
 * Renders a scan as one self-contained HTML file for sharing without a terminal or Code Scanning: inline styles, no
 * scripts, and no external requests (a CSP forbids them). Every value is escaped. The full JSON report is embedded as an
 * inert data block, so the page and `--format json` always describe the same scan. Findings keep the JSON order.
 */
export function renderHtml(result: ScanResult): string {
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
    `<style>${HTML_STYLE}</style>`,
    "</head>",
    "<body>",
    "<h1>Evergreen report</h1>",
    `<p class="meta">${meta.map(escapeHtml).join("<br>")}</p>`,
    `<p><strong>${count} finding${count === 1 ? "" : "s"}</strong></p>`,
    ...result.findings.map(htmlFinding),
    ...notes,
    `<script type="application/json" id="evergreen-report">${data}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/** The most findings `--format compact` lists. The rest are counted, not listed. */
export const COMPACT_MAX_FINDINGS = 25;
/** The longest one compact line gets, in characters; longer lines end in an ellipsis. */
export const COMPACT_MAX_LINE = 240;
/** The documented ceiling on compact output: the header, {@link COMPACT_MAX_FINDINGS} lines, and the omitted note. */
export const COMPACT_MAX_BYTES = 8192;

const severityRank = (severity: Severity) => severityValues.indexOf(severity);

/**
 * Renders a scan for an agent's context window: one line per finding with its id, location, severity, and replacement,
 * most severe first, capped at {@link COMPACT_MAX_FINDINGS} findings with a count of the ones left out. Findings keep
 * the order the other machine-readable reporters use within a severity, so the same scan always renders the same way.
 */
export function renderCompact(result: ScanResult): string {
  const findings = [...result.findings].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || findingOrder(left, right));
  const lines = [`Evergreen: ${findings.length} finding${findings.length === 1 ? "" : "s"}`];
  for (const finding of findings.slice(0, COMPACT_MAX_FINDINGS)) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    const text = `${finding.id} ${finding.location.path}${line} ${finding.severity} ${finding.replacement ?? "-"}`.replace(/\s+/g, " ");
    lines.push(text.length > COMPACT_MAX_LINE ? `${text.slice(0, COMPACT_MAX_LINE - 1)}…` : text);
  }
  const omitted = findings.length - COMPACT_MAX_FINDINGS;
  if (omitted > 0) lines.push(`${omitted} more finding${omitted === 1 ? "" : "s"} omitted; use --format json for all.`);
  return lines.join("\n");
}

export interface TextOptions {
  /** No Evergreen config exists yet: lead with a short summary and the next command to run. */
  firstRun?: boolean;
}

/** A headline, the top three findings, and the next command, for a user who has not set Evergreen up yet. */
export function renderFirstRunSummary(result: ScanResult): string[] {
  const count = result.findings.length;
  if (count === 0) {
    return ["No lifecycle risks found. Evergreen checked this repository and it looks healthy.", "Next: run `evergreen init --personal` to check every repository before you push.", ""];
  }
  const lines = [`Found ${count} lifecycle risk${count === 1 ? "" : "s"}. The most urgent:`];
  for (const finding of result.findings.slice(0, 3)) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    lines.push(`  ${finding.severity.toUpperCase()} ${finding.title} (${finding.location.path}${line})`);
  }
  if (count > 3) lines.push(`  …and ${count - 3} more below.`);
  lines.push("Next: run `evergreen init --personal` to check every repository before you push.", "");
  return lines;
}

export function renderText(result: ScanResult, options: TextOptions = {}): string {
  const lines = [
    ...(options.firstRun ? renderFirstRunSummary(result) : []),
    "Evergreen scan",
    `Repository: ${result.root}`,
    `Findings: ${result.findings.length}`,
    ...(result.data ? [describeData(result.data)] : []),
  ];
  const unclassified = result.unclassified?.count ?? 0;
  if (unclassified > 0) {
    lines.push(
      `Unclassified: ${unclassified} pinned reference${unclassified === 1 ? "" : "s"} (use JSON output for details)`,
    );
  }

  for (const finding of result.findings) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    lines.push("", `${finding.severity.toUpperCase()} ${finding.title}`);
    lines.push(`${finding.location.path}${line}`);
    lines.push(`Confidence: ${finding.confidence}`);
    lines.push(finding.summary);
    if (finding.dependencyPath) {
      lines.push(`Path: ${finding.dependencyPath.join(" > ")}`);
    }
    if (finding.replacement) {
      lines.push(`Replacement: ${finding.replacement}`);
    }
    if (finding.deadline) {
      lines.push(`Deadline: ${finding.deadline}`);
    }
    if (finding.impact) {
      lines.push(
        `Impact: ${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`,
      );
    }
    for (const usage of finding.usages ?? []) {
      const usageLine = usage.location.line ? `:${usage.location.line}` : "";
      lines.push(`Usage: ${usage.location.path}${usageLine} — ${usage.kind} ${usage.symbol}`);
    }
    for (const source of finding.sources) {
      lines.push(`Source: ${source.url}`);
    }
  }

  if (result.suppressions) {
    const state = result.suppressions;
    lines.push("", `Baseline: ${state.suppressed} finding${state.suppressed === 1 ? "" : "s"} suppressed, ${state.expiring.length} expiring${state.warnWithinDays === undefined ? "" : ` within ${state.warnWithinDays} days`}, ${state.expired.length} expired.`);
  }

  for (const diagnostic of result.diagnostics) {
    lines.push("", `Note: ${diagnostic}`);
  }

  return lines.join("\n");
}

export function renderCheckText(check: DependencyCheck): string {
  const lines = [
    "Evergreen check",
    check.version ? `${check.purl}@${check.version}` : check.purl,
    `Status: ${check.status}${check.severity ? ` (${check.severity})` : ""}`,
    ...(check.data ? [describeData(check.data)] : []),
    "",
    check.message,
  ];
  if (check.data?.stale) lines.push("", `Warning: The lifecycle data is ${check.data.ageDays} days old (stale after 30), so this answer may miss recent changes. Run "evergreen data update".`);
  for (const finding of check.findings) {
    lines.push("", `${finding.severity.toUpperCase()} ${finding.title}`, finding.summary);
    lines.push(`Event: ${finding.event}`, `Affected versions: ${finding.affectedVersions}`);
    if (finding.replacement) lines.push(`Replacement: ${finding.replacement}`);
    if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
    for (const source of finding.sources) lines.push(`Source: ${source.url}`);
  }
  return lines.join("\n");
}

export function renderFindingText(finding: ScanResult["findings"][number]): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  const lines = [
    `${finding.severity.toUpperCase()} ${finding.title}`,
    `ID: ${finding.id}`,
    `Rule: ${finding.ruleId}`,
    `Location: ${finding.location.path}${line}`,
    "",
    finding.summary,
  ];
  if (finding.dependencyPath) lines.push("", `Path: ${finding.dependencyPath.join(" > ")}`);
  if (finding.replacement) lines.push("", `Replacement: ${finding.replacement}`);
  if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
  if (finding.impact) {
    lines.push(
      `Impact: ${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`,
    );
  }
  if (finding.usages?.length) {
    lines.push(
      "",
      "Affected usages:",
      ...finding.usages.map((usage) => {
        const usageLine = usage.location.line ? `:${usage.location.line}` : "";
        return `- ${usage.location.path}${usageLine} — ${usage.kind} ${usage.symbol}`;
      }),
    );
  }
  lines.push("", "Sources:", ...finding.sources.map((source) => `- ${source.title}: ${source.url}`));
  return lines.join("\n");
}

function renderUpgradePath(path: UpgradePath): string[] {
  const target = path.target.replacement
    ? path.target.replacement
    : `${path.target.title} (${path.target.versions}${path.target.endsOn ? `, supported until ${path.target.endsOn}` : ""})`;
  return [
    "Upgrade path:",
    `- From: ${path.from.title} (${path.from.versions})`,
    ...path.skipped.map((line) => `- Skip: ${line.title} (${line.versions}) — ${line.status === "ended" ? "support has ended" : `support ends ${line.endsOn}`}`),
    `- Land on: ${target}`,
  ];
}

export function renderMigrationPacketText(packet: MigrationPacket): string {
  const lines = [
    `Migration context: ${packet.finding.title}`,
    `Finding: ${packet.finding.id}`,
    `Severity: ${packet.finding.severity}`,
    "",
    "Affected files:",
    ...packet.affectedFiles.map((path) => `- ${path}`),
    "",
    "Constraints:",
    ...packet.constraints.map((constraint) => `- ${constraint}`),
    "",
    "Migration steps:",
    ...packet.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.instructions}`),
    ...(packet.upgradePath ? ["", ...renderUpgradePath(packet.upgradePath)] : []),
    "",
    "Verification:",
    ...packet.verification.map((verification) =>
      `- ${verification.command} — ${verification.purpose}`
    ),
    "",
    "Sources:",
    ...packet.sources.map((source) => `- ${source.title}: ${source.url}`),
  ];
  return lines.join("\n");
}
