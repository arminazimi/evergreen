import process from "node:process";

import { bundledRules } from "../check-dependency.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine/index.js";
import type { Forecast } from "../forecast.js";
import { buildForecast, DEFAULT_FORECAST_MONTHS, MAX_FORECAST_MONTHS, renderForecastText } from "../forecast.js";
import { renderForecastSvg } from "../forecast-svg.js";
import { renderForecastTimeline } from "../forecast-timeline.js";
import { renderForecastMermaid } from "../reporters.js";
import type { Gated } from "./runtime.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { CliCommand, CommandContext } from "./types.js";

/** The output modes forecast offers, and the severity flag that picks between them. */
interface ForecastModes {
  readonly svg: boolean;
  readonly animate: boolean;
  readonly timeline: boolean;
  readonly json: boolean;
  readonly format: string | undefined;
}

/** Two forecast flags that cannot mean one output, with the message the command prints for them. */
interface ForecastModeConflict {
  readonly message: string;
  readonly when: (modes: ForecastModes) => boolean;
}

/** The refused combinations in the order the command reports them. */
const forecastModeConflicts: readonly ForecastModeConflict[] = [
  { message: "--animate needs --svg.", when: (modes) => modes.animate && !modes.svg },
  { message: "Use either --svg or --json, not both.", when: (modes) => modes.svg && modes.json },
  { message: "Use either --timeline or --json, not both.", when: (modes) => modes.timeline && modes.json },
  { message: "Use either --svg or --timeline, not both.", when: (modes) => modes.svg && modes.timeline },
  {
    message: "Use either --timeline or --format mermaid, not both.",
    when: (modes) => modes.timeline && modes.format === "mermaid",
  },
];

/** The first combination of output modes forecast refuses; undefined when they fit together. */
function forecastModeFailure(modes: ForecastModes, ctx: CommandContext): number | undefined {
  for (const conflict of forecastModeConflicts) {
    if (conflict.when(modes)) return ctx.fail("usage", conflict.message);
  }
  return undefined;
}

/** The horizon check: a usage failure unless --months is a whole number the forecast allows. */
function forecastMonthsFailure(months: number, ctx: CommandContext): number | undefined {
  if (!Number.isInteger(months) || months < 1 || months > MAX_FORECAST_MONTHS) {
    return ctx.fail("usage", `--months must be a whole number from 1 to ${MAX_FORECAST_MONTHS}.`);
  }
  return undefined;
}

/** Prints the forecast in the selected mode: the SVG, the mermaid block, the timeline, JSON, or text. */
function printForecast(forecast: Forecast, modes: ForecastModes): void {
  if (modes.svg) {
    process.stdout.write(`${renderForecastSvg(forecast, { animate: modes.animate })}\n`);
    return;
  }
  if (modes.format === "mermaid") {
    process.stdout.write(`${renderForecastMermaid(forecast)}\n`);
    return;
  }
  if (modes.timeline) {
    const width = Math.min(process.stdout.columns || 80, 100);
    const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
    process.stdout.write(`${renderForecastTimeline(forecast, { width, color })}\n`);
    return;
  }
  process.stdout.write(`${modes.json ? JSON.stringify(forecast, null, 2) : renderForecastText(forecast)}\n`);
}

export const command: CliCommand = {
  name: "forecast",
  flags: ["--months", "--as-of", "--today", "--svg", "--animate", "--timeline", "--json", "--format", "--data-version"],
  example: "evergreen forecast . --months 6",
  usage: [
    "  evergreen forecast [path] [--months <n>] [--as-of <YYYY-MM-DD>] [--svg [--animate] | --timeline | --json | --format mermaid]   # what reaches end of life next, by month",
    "  evergreen forecast [path] [--months <n>] [--as-of <YYYY-MM-DD>] [--timeline | --json | --format mermaid]   # what reaches end of life next, by month",
  ],
  usageSlots: [13, 14],
  run(args, ctx) {
    return afterGates("forecast", args, ctx, async (state: Gated) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      const modes: ForecastModes = {
        svg: state.args.includes("--svg"),
        animate: state.args.includes("--animate"),
        timeline: state.args.includes("--timeline"),
        json: state.json,
        format: state.format,
      };
      const modeFailure = forecastModeFailure(modes, ctx);
      if (modeFailure !== undefined) return modeFailure;
      const monthsValue = state.optionValue("--months");
      const months = monthsValue === undefined ? DEFAULT_FORECAST_MONTHS : Number(monthsValue);
      const monthsFailure = forecastMonthsFailure(months, ctx);
      if (monthsFailure !== undefined) return monthsFailure;
      const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
      const forecast = buildForecast(
        await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache }),
        await bundledRules(),
        asOfValue ?? new Date().toISOString().slice(0, 10),
        months,
      );
      printForecast(forecast, modes);
      return 0;
    });
  },
};
