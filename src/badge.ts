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

const LABEL = "evergreen";
const HEIGHT = 20;
const PAD = 8;
const ICON = 14;
const LABEL_TEXT_WIDTH = 54;
const GLYPH_WIDTH = 6.4;
const FONT = "Inter,-apple-system,Segoe UI,Verdana,sans-serif";

/** The Version Notches mark (brand/assets) in the badge's light-on-dark colors. */
function mark(x: number, y: number): string {
  const mask = (id: string, notch: string): string =>
    `<mask id="${id}"><rect width="256" height="256" fill="#fff"/><rect ${notch}/></mask>`;
  return [
    `<g transform="translate(${x} ${y}) scale(${ICON / 256})" fill="none" stroke-width="20">`,
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
export function renderBadgeSvg(result: Pick<ScanResult, "findings" | "data">, expiredFailure = false): string {
  const { message, color } = badgeState(result, expiredFailure);
  const labelWidth = PAD + ICON + LABEL_TEXT_WIDTH + PAD;
  const messageText = Math.round(message.length * GLYPH_WIDTH);
  const messageWidth = messageText + 2 * PAD;
  const width = labelWidth + messageWidth;
  const label = `${LABEL}: ${message}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${label}">`,
    `<title>${label}</title>`,
    `<clipPath id="r"><rect width="${width}" height="${HEIGHT}" rx="3"/></clipPath>`,
    '<g clip-path="url(#r)">',
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="#0C1110"/>`,
    `<rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${color}"/>`,
    `<rect x="${labelWidth}" width="1" height="${HEIGHT}" fill="#fff" opacity=".12"/>`,
    "</g>",
    `<rect width="${width}" height="${HEIGHT}" rx="3" fill="none" stroke="#000" stroke-opacity=".12"/>`,
    mark(PAD, 3),
    `<g fill="#fff" font-family="${FONT}" font-size="11" font-weight="600" text-rendering="geometricPrecision">`,
    `<text x="${PAD + ICON}" y="14" textLength="${LABEL_TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs">${LABEL}</text>`,
    `<text x="${labelWidth + PAD}" y="14" textLength="${messageText}" lengthAdjust="spacingAndGlyphs">${message}</text>`,
    "</g>",
    "</svg>",
  ].join("");
}
