import type { ScanResult, Severity } from "./domain.js";
import { severityValues } from "./domain.js";

/** Brand palette (brand/tokens.css) plus muted severity colors that sit next to it. */
const colors = {
  clean: "#2F7D5B",
  quiet: "#4C7C6D",
  low: "#B89B3C",
  medium: "#C9822F",
  high: "#B84A3E",
  expired: "#8E3B34",
} as const;

const severityColors: Record<Severity, string> = {
  critical: colors.high,
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
  info: colors.quiet,
};

export interface BadgeState {
  message: string;
  color: string;
}

/**
 * What the README badge says. Counts findings after baseline comparison and names the highest
 * remaining severity; `expired` and `stale` only ever add to that, they never hide a finding.
 */
export function badgeState(result: Pick<ScanResult, "findings" | "data">, expiredFailure = false): BadgeState {
  const count = result.findings.length;
  const highest = [...severityValues].reverse().find((severity) => result.findings.some((finding) => finding.severity === severity));
  const stale = result.data?.stale === true;
  if (expiredFailure) return { message: highest ? `${count} ${highest} · expired` : "expired", color: colors.expired };
  if (highest) return { message: `${count} ${highest}${stale ? " · stale" : ""}`, color: severityColors[highest] };
  return stale ? { message: "stale", color: colors.quiet } : { message: "clean", color: colors.clean };
}

export type BadgeStyle = "flat" | "flat-square" | "for-the-badge";

export const badgeStyles: readonly BadgeStyle[] = ["flat", "flat-square", "for-the-badge"];

const LABEL = "evergreen";
const HEIGHT = 20;
const LARGE_HEIGHT = 28;
const PAD = 7;
const ICON = 12;
const LARGE_ICON = 16;
const GAP = 4;
const LABEL_TEXT_WIDTH = 52;
const LARGE_LABEL_TEXT_WIDTH = 60;
const GLYPH_WIDTH = 6.4;
const FONT = "Verdana,Geneva,DejaVu Sans,sans-serif";
const WHITE = "#FFFFFF";
const DARK_TEXT = "#0C1110";

interface BadgeLayout {
  height: number;
  radius: number;
  fontSize: number;
  fontWeight: number;
  iconSize: number;
  labelTextWidth: number;
  uppercase: boolean;
}

function layoutFor(style: BadgeStyle): BadgeLayout {
  if (style === "for-the-badge") {
    return { height: LARGE_HEIGHT, radius: 0, fontSize: 10, fontWeight: 700, iconSize: LARGE_ICON, labelTextWidth: LARGE_LABEL_TEXT_WIDTH, uppercase: true };
  }
  return { height: HEIGHT, radius: style === "flat" ? 3 : 0, fontSize: 11, fontWeight: 400, iconSize: ICON, labelTextWidth: LABEL_TEXT_WIDTH, uppercase: false };
}

function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** WCAG 2.1 contrast ratio between two `#RRGGBB` colors, from 1 (identical) to 21. */
export function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** White or the badge's near-black, whichever reads better on the message color; both clear WCAG AA. */
export function readableTextColor(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, DARK_TEXT) ? WHITE : DARK_TEXT;
}

export type BadgeSnippetFormat = "markdown" | "html" | "rst";

export const badgeSnippetFormats: readonly BadgeSnippetFormat[] = ["markdown", "html", "rst"];

export function isBadgeSnippetFormat(value: string): value is BadgeSnippetFormat {
  return (badgeSnippetFormats as readonly string[]).includes(value);
}

/** `owner/name` from a GitHub remote URL; undefined for another host or a malformed URL. */
export function repositoryFromRemote(url: string): string | undefined {
  const match = /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i.exec(url.trim());
  if (!match) return undefined;
  const owner = match[1]!;
  const name = match[2]!.replace(/\.git$/, "");
  return name.length > 0 ? `${owner}/${name}` : undefined;
}

function repositoryParts(repository: string): [string, string] {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Invalid repository "${repository}"; expected owner/name`);
  }
  return [parts[0]!, parts[1]!];
}

const encodeSegment = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * README markup for the badge a repository publishes from its `evergreen-badge` branch. The repository name is
 * percent-encoded into the URL and HTML-escaped in the attribute, so a hostile name cannot break out of the markup.
 */
export function badgeSnippet(repository: string, format: BadgeSnippetFormat, branch = "evergreen-badge"): string {
  const [owner, name] = repositoryParts(repository);
  const branchPath = branch
    .split("/")
    .filter((part) => part.length > 0)
    .map(encodeSegment)
    .join("/");
  if (branchPath.length === 0) throw new Error("The badge branch must not be empty");
  const image = `https://raw.githubusercontent.com/${encodeSegment(owner)}/${encodeSegment(name)}/${branchPath}/evergreen-badge.svg`;
  const target = `https://github.com/${encodeSegment(owner)}/${encodeSegment(name)}`;
  if (format === "html") return `<a href="${escapeHtmlAttribute(target)}"><img alt="evergreen" src="${escapeHtmlAttribute(image)}"></a>`;
  if (format === "rst") return `.. image:: ${image}\n   :target: ${target}\n   :alt: evergreen`;
  return `[![evergreen](${image})](${target})`;
}

/** The Version Notches mark (brand/assets) in the badge's light-on-dark colors. */
function mark(x: number, y: number, size = ICON): string {
  const mask = (id: string, notch: string): string =>
    `<mask id="${id}"><rect width="256" height="256" fill="#fff"/><rect ${notch}/></mask>`;
  return [
    `<g transform="translate(${x} ${y}) scale(${size / 256})" fill="none" stroke-width="20">`,
    mask("o", 'x="119" y="18" width="18" height="28"'),
    mask("m", 'x="186" y="119" width="30" height="18"'),
    mask("i", 'x="119" y="160" width="18" height="30"'),
    '<circle cx="128" cy="128" r="96" stroke="#F3F6F4" mask="url(#o)"/>',
    '<circle cx="128" cy="128" r="70" stroke="#9AC7B6" mask="url(#m)"/>',
    '<circle cx="128" cy="128" r="44" stroke="#CFE8DD" mask="url(#i)"/>',
    "</g>",
  ].join("");
}

/**
 * A self-contained SVG badge in the Evergreen brand colors. Text widths are fixed with
 * `textLength`, so the layout does not depend on which font the viewer has.
 */
export function renderBadgeSvg(result: Pick<ScanResult, "findings" | "data">, expiredFailure = false, style: BadgeStyle = "flat"): string {
  const { message, color } = badgeState(result, expiredFailure);
  const layout = layoutFor(style);
  const labelWidth = PAD + layout.iconSize + GAP + layout.labelTextWidth + PAD;
  const messageText = Math.round(message.length * GLYPH_WIDTH);
  const messageWidth = messageText + 2 * PAD;
  const width = labelWidth + messageWidth;
  const label = `${LABEL}: ${message}`;
  const shownLabel = layout.uppercase ? LABEL.toUpperCase() : LABEL;
  const shownMessage = layout.uppercase ? message.toUpperCase() : message;
  const baseline = layout.height / 2 + 3.8;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${layout.height}" viewBox="0 0 ${width} ${layout.height}" role="img" aria-label="${label}">`,
    `<title>${label}</title>`,
    `<clipPath id="r"><rect width="${width}" height="${layout.height}" rx="${layout.radius}"/></clipPath>`,
    '<g clip-path="url(#r)">',
    `<rect width="${labelWidth}" height="${layout.height}" fill="${DARK_TEXT}"/>`,
    `<rect x="${labelWidth}" width="${messageWidth}" height="${layout.height}" fill="${color}"/>`,
    "</g>",
    mark(PAD, (layout.height - layout.iconSize) / 2, layout.iconSize),
    `<g font-family="${FONT}" font-size="${layout.fontSize}" font-weight="${layout.fontWeight}" text-rendering="geometricPrecision">`,
    `<text x="${PAD + layout.iconSize + GAP}" y="${baseline}" fill="${WHITE}" textLength="${layout.labelTextWidth}" lengthAdjust="spacingAndGlyphs">${shownLabel}</text>`,
    `<text x="${labelWidth + PAD}" y="${baseline}" fill="${readableTextColor(color)}" textLength="${messageText}" lengthAdjust="spacingAndGlyphs">${shownMessage}</text>`,
    "</g>",
    "</svg>",
  ].join("");
}
