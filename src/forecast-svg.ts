import type { Forecast, ForecastEvent } from "./forecast.js";
import type { Severity } from "./domain.js";

export interface ForecastSvgOptions {
  /** Total width in pixels. Defaults to 720. */
  width?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const severityOrder: readonly Severity[] = ["critical", "high", "medium", "low", "info"];
const LANE_TOP = 84;
const LANE_HEIGHT = 16;
const AXIS_Y = 176;
const HEIGHT = 220;
const PAD = 24;
const LEFT = 64;
const RIGHT = 24;

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

const pad = (value: number): string => String(value).padStart(2, "0");

/** Every calendar month between two ISO dates, inclusive. */
function monthKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${pad(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

function laneY(severity: Severity): number {
  const lane = severityOrder.indexOf(severity);
  return LANE_TOP + Math.max(lane, 0) * LANE_HEIGHT;
}

function describe(event: ForecastEvent): string {
  const affects = event.findings.length === 0 ? "" : `, affects ${event.findings.length} finding${event.findings.length === 1 ? "" : "s"}`;
  return `${event.date}: ${event.title} (${event.severity}${affects})`;
}

/**
 * A self-contained SVG timeline of the forecast: one marker per event, larger when the event affects the scanned
 * repository. No script, no fonts, and no external references, so it renders under `default-src 'none'` and reads in
 * light and dark through CSS custom properties.
 */
export function renderForecastSvg(forecast: Forecast, options: ForecastSvgOptions = {}): string {
  const width = Number.isFinite(options.width) ? Math.max(320, Math.round(options.width!)) : 720;
  const inner = width - LEFT - RIGHT;
  const start = dayNumber(forecast.today);
  const span = dayNumber(forecast.until) - start;
  const xFor = (date: string): number => {
    const offset = span <= 0 ? 0 : Math.min(1, Math.max(0, (dayNumber(date) - start) / span));
    return LEFT + offset * inner;
  };
  const events = forecast.groups.flatMap((group) => group.events);
  const description = [
    `End-of-life forecast from ${forecast.today} to ${forecast.until}: ${forecast.total} events, ${forecast.affecting} affecting this repository.`,
    ...events.map(describe),
  ].join(" ");
  const markers = events.map((event) => {
    const affecting = event.findings.length > 0;
    return `<circle class="forecast-event ${event.severity}${affecting ? " affecting" : ""}" cx="${xFor(event.date).toFixed(1)}" cy="${laneY(event.severity)}" r="${affecting ? 7 : 4}"><title>${escape(describe(event))}</title></circle>`;
  });
  const keys = monthKeys(forecast.today, forecast.until);
  const labelEvery = Math.max(1, Math.ceil(keys.length / Math.max(1, Math.floor(inner / 64))));
  const ticks = keys.map((month, index) => {
    const x = xFor(`${month}-01`).toFixed(1);
    const label =
      index % labelEvery === 0
        ? `<text class="forecast-month" x="${x}" y="${AXIS_Y + 20}" text-anchor="middle">${escape(`${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`)}</text>`
        : "";
    return `<line class="forecast-tick" x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${AXIS_Y + 5}"/>${label}`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-labelledby="forecast-title forecast-desc" class="evergreen-forecast">`,
    `<title id="forecast-title">End-of-life forecast</title>`,
    `<desc id="forecast-desc">${escape(description)}</desc>`,
    "<style>",
    ".evergreen-forecast{--bg:#FFFFFF;--fg:#0C1110;--muted:#5E736B;--line:#DCE5E1;--critical:#B84A3E;--high:#B84A3E;--medium:#C9822F;--low:#B89B3C;--info:#4C7C6D}",
    "@media (prefers-color-scheme:dark){.evergreen-forecast{--bg:#0C1110;--fg:#E7EDEA;--muted:#9AB0A7;--line:#23423A;--critical:#E58F83;--high:#E58F83;--medium:#E0A766;--low:#D6C171;--info:#8FB8A8}}",
    ".evergreen-forecast{font-family:Verdana,Geneva,DejaVu Sans,sans-serif}",
    ".evergreen-forecast text{fill:var(--fg)}.evergreen-forecast .forecast-muted{fill:var(--muted)}",
    ".evergreen-forecast .forecast-background{fill:var(--bg)}",
    ".evergreen-forecast .forecast-line{stroke:var(--line);fill:none}.evergreen-forecast .forecast-tick{stroke:var(--line)}",
    ".evergreen-forecast .forecast-month{fill:var(--muted);font-size:10px}",
    ".evergreen-forecast .forecast-event{stroke:var(--bg);stroke-width:1.5}",
    ".evergreen-forecast .critical,.evergreen-forecast .high{fill:var(--critical)}",
    ".evergreen-forecast .medium{fill:var(--medium)}.evergreen-forecast .low{fill:var(--low)}.evergreen-forecast .info{fill:var(--info)}",
    "</style>",
    '<rect class="forecast-background" width="100%" height="100%"/>',
    `<text x="${PAD}" y="30" font-size="15" font-weight="700">End-of-life forecast</text>`,
    `<text class="forecast-muted" x="${PAD}" y="50" font-size="11">${escape(`${forecast.total} events · ${forecast.affecting} affecting this repository · ${forecast.today} to ${forecast.until}`)}</text>`,
    ...severityOrder.map((severity, index) => `<text class="forecast-muted" x="8" y="${LANE_TOP + index * LANE_HEIGHT + 4}" font-size="9">${severity}</text>`),
    `<line class="forecast-line" x1="${LEFT}" y1="${AXIS_Y}" x2="${width - RIGHT}" y2="${AXIS_Y}"/>`,
    ...ticks,
    ...markers,
    "</svg>",
  ].join("");
}
