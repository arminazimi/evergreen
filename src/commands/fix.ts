import process from "node:process";

import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine/index.js";
import { countFindingsAfter, playFixShow } from "../fix-show.js";
import { applyOnBranch } from "../fix/git.js";
import { planFixReport, renderPatches } from "../fix/index.js";
import { renderVerification, verifyFix } from "../fix/verify.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { ScanResult } from "../domain.js";
import type { FilePatch, FixPlan } from "../fix/types.js";
import type { CliCommand } from "./types.js";

const FIX_FLAGS = new Set(["--dry-run", "--branch", "--data-version", "--json", "--show", "--no-animation"]);

/** False for an unknown flag, a second path, or a flag combination `fix` does not define. */
function validFixArguments(args: readonly string[], positional: readonly string[]): boolean {
  const has = (flag: string): boolean => args.includes(flag);
  const unknownFlag = args.slice(1).find((argument) => argument.startsWith("-") && !FIX_FLAGS.has(argument));
  return !(
    unknownFlag !== undefined ||
    positional.length > 1 ||
    (has("--dry-run") && has("--branch")) ||
    (has("--json") && (has("--branch") || has("--show"))) ||
    (has("--no-animation") && !has("--show"))
  );
}

interface FixRun {
  root: string;
  noCache: boolean;
  args: readonly string[];
  scanned: ScanResult;
  plan: FixPlan;
  patches: FilePatch[];
}

const files = (count: number): string => `${count} file${count === 1 ? "" : "s"}`;
const patchCount = (count: number): string => `${count} patch${count === 1 ? "" : "es"}`;

async function show(run: FixRun, after: number): Promise<void> {
  await playFixShow(
    run.plan,
    { before: run.scanned.findings.length, after },
    { noAnimation: run.args.includes("--no-animation") },
  );
}

async function fixOnBranch(run: FixRun): Promise<number> {
  const applied = await applyOnBranch(run.root, run.patches);
  const rescanned = await scanRepository(run.root, builtInDetectors, { noCache: run.noCache });
  if (run.args.includes("--show")) await show(run, rescanned.findings.length);
  process.stderr.write(
    `Committed ${files(applied.files.length)} on branch ${applied.branch} (${applied.commit}). Nothing was pushed; undo with: git branch -D ${applied.branch}\n`,
  );
  process.stderr.write(renderVerification(verifyFix(run.scanned, rescanned)));
  return 0;
}

async function fixDryRun(run: FixRun): Promise<number> {
  if (run.args.includes("--show")) {
    await show(run, await countFindingsAfter(run.root, run.patches, { noCache: run.noCache }));
    process.stderr.write(`${patchCount(run.patches.length)} shown; nothing was written.\n`);
    return 0;
  }
  process.stdout.write(renderPatches(run.patches));
  process.stderr.write(
    `${patchCount(run.patches.length)} printed; nothing was written. Apply with: evergreen fix | git apply\n`,
  );
  return 0;
}

export const command: CliCommand = {
  name: "fix",
  flags: ["--dry-run", "--show", "--no-animation", "--data-version"],
  example: "evergreen fix . --dry-run",
  usage: [
    "  evergreen fix [path] [--dry-run] [--json]   # print patches for deterministic fixes; nothing is written",
    "  evergreen fix [path] --branch               # apply the fixes on a local evergreen/fix branch and commit; never pushes",
    "  evergreen fix [path] --show [--branch] [--no-animation]   # play the fixes as a before-and-after view; nothing is written without --branch",
  ],
  usageSlots: [34, 35, 35.5],
  run(args, ctx) {
    return afterGates("fix", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      // Patches are printed unless --branch asks for a local, reviewable commit; nothing is ever pushed.
      if (!validFixArguments(state.args, state.positional)) {
        return ctx.fail(
          "usage",
          "Usage: evergreen fix [path] [--dry-run | --branch] [--json | --show [--no-animation]]",
        );
      }
      const scanned = await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache });
      const plan = await planFixReport(scanned);
      if (state.args.includes("--json")) {
        process.stdout.write(`${JSON.stringify({ schemaVersion: "evergreen.fix.v1", ...plan }, null, 2)}\n`);
        return 0;
      }
      const patches = plan.patches.map(({ path, diff }) => ({ path, diff }));
      if (patches.length === 0) {
        process.stderr.write("No deterministic fixes found.\n");
        return 0;
      }
      const run: FixRun = {
        root: state.pathArgument,
        noCache: state.noCache,
        args: state.args,
        scanned,
        plan,
        patches,
      };
      return state.args.includes("--branch") ? await fixOnBranch(run) : await fixDryRun(run);
    });
  },
};
