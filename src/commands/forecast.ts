import process from "node:process";

import { bundledRules } from "../check-dependency.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { buildForecast, DEFAULT_FORECAST_MONTHS, MAX_FORECAST_MONTHS, renderForecastText } from "../forecast.js";
import { renderForecastSvg } from "../forecast-svg.js";
import { renderForecastTimeline } from "../forecast-timeline.js";
import { renderForecastMermaid } from "../reporters.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { CliCommand } from "./types.js";

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
    return afterGates("forecast", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      const { args: full, pathArgument, json, noCache, format } = state;
      const timeline = full.includes("--timeline");
      const svg = full.includes("--svg");
      const animate = full.includes("--animate");
      if (animate && !svg) return ctx.fail("usage", "--animate needs --svg.");
      if (svg && json) return ctx.fail("usage", "Use either --svg or --json, not both.");
      if (timeline && json) return ctx.fail("usage", "Use either --timeline or --json, not both.");
      if (svg && timeline) return ctx.fail("usage", "Use either --svg or --timeline, not both.");
      if (timeline && format === "mermaid") return ctx.fail("usage", "Use either --timeline or --format mermaid, not both.");
      const monthsValue = state.optionValue("--months");
      const months = monthsValue === undefined ? DEFAULT_FORECAST_MONTHS : Number(monthsValue);
      if (!Number.isInteger(months) || months < 1 || months > MAX_FORECAST_MONTHS) {
        return ctx.fail("usage", `--months must be a whole number from 1 to ${MAX_FORECAST_MONTHS}.`);
      }
      const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
      const forecast = buildForecast(await scanRepository(pathArgument, builtInDetectors, { noCache }), await bundledRules(), asOfValue ?? new Date().toISOString().slice(0, 10), months);
      if (svg) {
        process.stdout.write(`${renderForecastSvg(forecast, { animate })}\n`);
        return 0;
      }
      if (format === "mermaid") {
        process.stdout.write(`${renderForecastMermaid(forecast)}\n`);
        return 0;
      }
      if (timeline) {
        const width = Math.min(process.stdout.columns || 80, 100);
        const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
        process.stdout.write(`${renderForecastTimeline(forecast, { width, color })}\n`);
        return 0;
      }
      process.stdout.write(`${json ? JSON.stringify(forecast, null, 2) : renderForecastText(forecast)}\n`);
      return 0;
    });
  },
};
