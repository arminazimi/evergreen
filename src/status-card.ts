import { badgeState } from "./badge.js";
import type { ScanResult } from "./domain.js";

export type StatusCardSize = "card" | "social";

export interface StatusCardOptions {
  /** The repository name shown in the card. */
  repository?: string;
  /**
   * `"card"` (default) is the compact 520×150 summary.
   * `"social"` is a 1200×630 Open Graph preview of the same summary.
   */
  size?: StatusCardSize;
}

/** Brand token fonts (brand/tokens.json). Named stacks only — no remote `@font-face` or URLs. */
const FONT_SANS = "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
/** Compact card keeps the badge-compatible stack so README embeds look the same as shields.io. */
const FONT_CARD = "Verdana,Geneva,DejaVu Sans,sans-serif";

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

const isDate = (value: string | undefined): value is string => value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);

interface CardContent {
  repository: string;
  message: string;
  color: string;
  description: string;
  metrics: Array<[string, string]>;
}

const content = (result: Pick<ScanResult, "findings" | "data">, options: StatusCardOptions): CardContent => {
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
  return {
    repository,
    message,
    color,
    description,
    metrics: [
      ["Findings", String(result.findings.length)],
      ["Next end of life", nextDeadline ?? "not dated"],
      ["Data", data ? dataLine : "not reported"],
    ],
  };
};

const renderCompact = ({ repository, message, color, description, metrics }: CardContent): string => {
  const columns = [28, 200, 366];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150" role="img" aria-labelledby="status-title status-desc" font-family="${FONT_CARD}">`,
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
};

/** Open Graph / Twitter card size; brand-token fonts and colors, no external references. */
const renderSocial = ({ repository, message, color, description, metrics }: CardContent): string => {
  const columns = [96, 440, 820];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="status-title status-desc" font-family="${FONT_SANS}">`,
    `<title id="status-title">evergreen status for ${escape(repository)}</title>`,
    `<desc id="status-desc">${escape(description)}</desc>`,
    '<rect width="1200" height="630" fill="#0C1110"/>',
    `<rect width="16" height="630" fill="${color}"/>`,
    '<rect x="64" y="64" width="1072" height="502" rx="24" fill="#17211E" stroke="#23423A"/>',
    `<text x="96" y="148" fill="#F3F6F4" font-size="42" font-weight="700">${escape(repository)}</text>`,
    `<text x="96" y="204" fill="${color}" font-size="28" font-weight="600">${escape(message)}</text>`,
    '<text x="96" y="256" fill="#9AC7B6" font-size="18" font-weight="500">evergreen</text>',
    '<line x1="96" y1="300" x2="1104" y2="300" stroke="#23423A"/>',
    ...metrics.flatMap(([label, value], index) => [
      `<text x="${columns[index]}" y="380" fill="#9AC7B6" font-size="18" font-weight="500">${escape(label)}</text>`,
      `<text x="${columns[index]}" y="440" fill="#F3F6F4" font-size="28" font-weight="600">${escape(value)}</text>`,
    ]),
    "</svg>",
  ].join("");
};

/**
 * A static SVG summary of one scan: findings, the next dated end of life, and the age of the data.
 * Reads only the scan result, so the same input always renders the same bytes.
 */
export function renderStatusCard(result: Pick<ScanResult, "findings" | "data">, options: StatusCardOptions = {}): string {
  const body = content(result, options);
  return options.size === "social" ? renderSocial(body) : renderCompact(body);
}
