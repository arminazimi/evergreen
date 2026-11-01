import process from "node:process";

import { bundledRules } from "../check-dependency.js";
import { buildCountdownRows, COUNTDOWN_WINDOW_MONTHS, DEFAULT_COUNTDOWN_LIMIT, renderCountdownJson, runCountdown } from "../countdown.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { buildForecast } from "../forecast.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "countdown",
  flags: ["--as-of", "--limit", "--json", "--once", "--no-animation", "--no-cache", "--data-version"],
  example: "evergreen countdown . --as-of 2026-10-25",
  usage: ["  evergreen countdown [path] [--as-of <YYYY-MM-DD>] [--limit <n>] [--json] [--once] [--no-animation]   # live countdown to each dated deadline"],
  usageSlots: [15],
  run(args, ctx) {
    return afterGates("countdown", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      const countdownUsage = "Usage: evergreen countdown [path] [--as-of <YYYY-MM-DD>] [--limit <n>] [--json] [--once] [--no-animation]";
      const limitFlag = state.args.includes("--limit");
      const limitValue = state.optionValue("--limit");
      if (limitFlag && (limitValue === undefined || limitValue.startsWith("-"))) {
        return ctx.fail("usage", "--limit needs a whole number of at least 1.", `\n${countdownUsage}`);
      }
      const limit = limitValue === undefined ? DEFAULT_COUNTDOWN_LIMIT : Number(limitValue);
      if (!Number.isInteger(limit) || limit < 1) {
        return ctx.fail("usage", "--limit needs a whole number of at least 1.", `\n${countdownUsage}`);
      }
      const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
      const today = asOfValue ?? new Date().toISOString().slice(0, 10);
      const forecast = buildForecast(await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache }), await bundledRules(), today, COUNTDOWN_WINDOW_MONTHS);
      const now = asOfValue === undefined ? Date.now() : Date.parse(`${asOfValue}T00:00:00Z`);
      if (state.json) {
        process.stdout.write(`${renderCountdownJson(buildCountdownRows(forecast, { now, limit }), now)}\n`);
        return 0;
      }
      return await runCountdown({ forecast, now, asOf: today, limit, once: state.args.includes("--once"), noAnimation: state.args.includes("--no-animation") });
    });
  },
};
