import process from "node:process";

import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { buildPlan } from "../plan-build.js";
import type { Plan } from "../plan.js";
import { renderPlanText } from "../plan-render.js";
import type { Gated } from "./runtime.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { CliCommand, CommandContext } from "./types.js";

const planUsage = "Usage: evergreen plan [path] [--json] [--wave <n>]";

/** Plan's own arguments on top of the shared gates: a usage failure, or the requested zero-based wave. */
function planWaveFlag(state: Gated, ctx: CommandContext): number | { readonly wave: number | undefined } {
  const planFlags = new Set(["--json", "--wave", "--data-version", "--no-cache"]);
  const unknownPlanFlag = state.args.slice(1).find((argument) => argument.startsWith("-") && !planFlags.has(argument));
  if (unknownPlanFlag !== undefined || state.positional.length > 1) return ctx.fail("usage", planUsage);
  const waveFlag = state.args.includes("--wave");
  const waveValue = state.optionValue("--wave");
  if (waveFlag && (waveValue === undefined || waveValue.startsWith("-"))) {
    return ctx.fail("usage", "--wave needs a zero-based wave index.", `\n${planUsage}`);
  }
  const wave = waveValue === undefined ? undefined : Number(waveValue);
  if (waveValue !== undefined && (!Number.isInteger(wave) || (wave as number) < 0)) {
    return ctx.fail("usage", "--wave must be a whole number >= 0.");
  }
  return { wave };
}

/** A requested wave the built plan cannot serve; the same exit code the command prints for it. */
function planWaveRangeFailure(plan: Plan, wave: number | undefined, ctx: CommandContext): number | undefined {
  if (wave !== undefined && (plan.waves.length === 0 || wave >= plan.waves.length)) {
    return ctx.fail(
      "usage",
      plan.waves.length === 0
        ? "--wave is out of range: the plan has no waves."
        : `--wave is out of range: expected 0..${plan.waves.length - 1}.`,
    );
  }
  return undefined;
}

export const command: CliCommand = {
  name: "plan",
  flags: ["--json", "--wave", "--data-version"],
  example: "evergreen plan . --json",
  usage: [
    "  evergreen plan [path] [--json] [--wave <n>]   # migration waves from a scan; --wave prints one zero-based wave",
  ],
  usageSlots: [16],
  run(args, ctx) {
    return afterGates("plan", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      const flags = planWaveFlag(state, ctx);
      if (typeof flags === "number") return flags;
      const plan = buildPlan(await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache }));
      const outOfRange = planWaveRangeFailure(plan, flags.wave, ctx);
      if (outOfRange !== undefined) return outOfRange;
      if (state.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return 0;
      }
      process.stdout.write(`${renderPlanText(plan, flags.wave)}\n`);
      return 0;
    });
  },
};
