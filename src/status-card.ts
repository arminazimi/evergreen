import { badgeState } from "./badge.js";
import type { ScanResult } from "./domain.js";

export interface StatusCardOptions {
  /** The repository name shown in the card. */
  repository?: string;
}

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

const isDate = (value: string | undefined): value is string => value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A static SVG summary of one scan: findings, the next dated end of life, and the age of the data.
 * Reads only the scan result, so the same input always renders the same bytes.
 */
export function renderStatusCard(result: Pick<ScanResult, "findings" | "data">, options: StatusCardOptions = {}): string {
  const { message, color } = badgeState(result);
  const repository = options.repository ?? "this repository";
  const nextDeadline = result.findings
    .map((finding) => finding.deadline)
    .filter(isDate)
    .sort()[0];
  const data = result.data;
  const dataLine = data
    ? `v${data.version} · reviewed ${data.reviewedThrough} · ${data.ageDays} day${data.ageDays === 1 ? "" : "s"} old${data.stale ? " · stale" : ""}`
    : "not reported";
  const description = `${message}: ${result.findings.length} findings. Next end of life ${nextDeadline ?? "not dated"}. Data ${dataLine}.`;
  const metrics: Array<[string, string]> = [
    ["Findings", String(result.findings.length)],
    ["Next end of life", nextDeadline ?? "not dated"],
    ["Data", data ? dataLine : "not reported"],
  ];
  const columns = [28, 200, 366];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150" role="img" aria-labelledby="status-title status-desc" font-family="Verdana,Geneva,DejaVu Sans,sans-serif">',
    `<title id="status-title">evergreen status for ${escape(repository)}</title>`,
    `<desc id="status-desc">${escape(description)}</desc>`,
    '<rect width="520" height="150" rx="10" fill="#0C1110"/>',
    `<rect width="6" height="150" fill="${color}"/>`,
    `<text x="28" y="38" fill="#E7EDEA" font-size="15" font-weight="700">${escape(repository)}</text>`,
    `<text x="28" y="58" fill="${color}" font-size="12">${escape(message)}</text>`,
    '<line x1="28" y1="74" x2="492" y2="74" stroke="#23423A"/>',
    ...metrics.flatMap(([label, value], index) => [
      `<text x="${columns[index]}" y="98" fill="#8FA69D" font-size="10">${escape(label)}</text>`,
      `<text x="${columns[index]}" y="120" fill="#E7EDEA" font-size="12">${escape(value)}</text>`,
    ]),
    "</svg>",
  ].join("");
}
