import type { Finding, ScanResult } from "../domain.js";
import { severityValues } from "../domain.js";
import { escapeMarkdown, findingOrder, severityRank } from "./shared.js";

/** The most findings a chat or webhook message lists. The rest are counted, not listed, so one message stays small. */
export const CHAT_MAX_FINDINGS = 20;
/** Slack's documented limit for the text of one section block, in characters. */
const SLACK_SECTION_MAX = 3000;

/** The findings most severe first, in the same order `--format compact` uses. */
export function sortedFindings(result: ScanResult): Finding[] {
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
