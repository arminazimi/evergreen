import type { Finding, ScanResult, Severity } from "../domain.js";
import { VERSION } from "../version.js";
import { compare, findingOrder } from "./shared.js";

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

/**
 * Renders a scan as one SARIF 2.1.0 run. Output is deterministic: rules and results are sorted, paths are
 * repository-relative with forward slashes, and nothing machine-specific (root, time) is included. Only
 * locations and Evergreen's own rule text are written; no source content is uploaded.
 */
export function renderSarif(result: ScanResult): string {
  const findings = [...result.findings].sort(findingOrder);
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))].sort(compare);
  const rules = ruleIds.flatMap((ruleId) => {
    const finding = findings.find((candidate) => candidate.ruleId === ruleId);
    if (!finding) return [];
    return [
      {
        id: ruleId,
        name: ruleId,
        shortDescription: { text: finding.title },
        help: sarifHelp(finding),
        ...(finding.sources[0] ? { helpUri: finding.sources[0].url } : {}),
        defaultConfiguration: { level: SARIF_LEVEL[finding.severity] },
        properties: { tags: ["lifecycle", finding.detector] },
      },
    ];
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
        ...(result.data
          ? {
              properties: {
                evergreenData: {
                  source: result.data.source,
                  version: result.data.version,
                  reviewedThrough: result.data.reviewedThrough,
                },
              },
            }
          : {}),
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
