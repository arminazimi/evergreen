import process from "node:process";

import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { applyOnBranch } from "../fix/git.js";
import { planFixReport, planFixes, renderPatches } from "../fix/index.js";
import { renderVerification, verifyFix } from "../fix/verify.js";
import { afterGates, preScanPhase, repositoryPhase } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "fix",
  flags: ["--dry-run", "--data-version"],
  example: "evergreen fix . --dry-run",
  usage: [
    "  evergreen fix [path] [--dry-run] [--json]   # print patches for deterministic fixes; nothing is written",
    "  evergreen fix [path] --branch               # apply the fixes on a local evergreen/fix branch and commit; never pushes",
  ],
  usageSlots: [34, 35],
  run(args, ctx) {
    return afterGates("fix", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const pre = preScanPhase(state, ctx);
      if (pre !== undefined) return pre;
      // Patches are printed unless --branch asks for a local, reviewable commit; nothing is ever pushed.
      const json = state.args.includes("--json");
      const fixFlags = new Set(["--dry-run", "--branch", "--data-version", "--json"]);
      const unknownFlag = state.args.slice(1).find((argument) => argument.startsWith("-") && !fixFlags.has(argument));
      if (unknownFlag !== undefined || state.positional.length > 1 || (state.args.includes("--dry-run") && state.args.includes("--branch")) || (json && state.args.includes("--branch"))) {
        return ctx.fail("usage", "Usage: evergreen fix [path] [--dry-run | --branch] [--json]");
      }
      const scanned = await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache });
      if (json) {
        process.stdout.write(`${JSON.stringify({ schemaVersion: "evergreen.fix.v1", ...await planFixReport(scanned) }, null, 2)}\n`);
        return 0;
      }
      const patches = await planFixes(scanned);
      if (patches.length === 0) {
        process.stderr.write("No deterministic fixes found.\n");
        return 0;
      }
      if (state.args.includes("--branch")) {
        const applied = await applyOnBranch(state.pathArgument, patches);
        process.stderr.write(`Committed ${applied.files.length} file${applied.files.length === 1 ? "" : "s"} on branch ${applied.branch} (${applied.commit}). Nothing was pushed; undo with: git branch -D ${applied.branch}\n`);
        process.stderr.write(renderVerification(verifyFix(scanned, await scanRepository(state.pathArgument, builtInDetectors, { noCache: state.noCache }))));
        return 0;
      }
      process.stdout.write(renderPatches(patches));
      process.stderr.write(`${patches.length} patch${patches.length === 1 ? "" : "es"} printed; nothing was written. Apply with: evergreen fix | git apply\n`);
      return 0;
    });
  },
};
