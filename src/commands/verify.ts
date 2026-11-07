import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { installedPackageRoot, ReleaseManifestError } from "../release-manifest.js";
import { renderReleaseVerification, verifyInstalledRelease } from "../verify-release.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

/** The first flag this command does not take, so a typo fails as usage instead of being ignored. */
function unknownFlag(args: readonly string[]): string | undefined {
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--data-version") {
      index += 1;
      continue;
    }
    if (argument !== undefined && argument.startsWith("-")) return argument;
  }
  return undefined;
}

export const command: CliCommand = {
  name: "verify",
  flags: ["--data-version"],
  example: "evergreen verify",
  usage: [
    "  evergreen verify [path]   # check the installed release's files against its manifest and say what it cannot check offline",
  ],
  run(args, ctx) {
    return afterGates("verify", args, ctx, async (state) => {
      const flag = unknownFlag(state.args);
      if (flag !== undefined) return ctx.fail("usage", `verify does not take ${flag}.`, `\n${ctx.help}`);
      if (state.positional.length > 1) return ctx.fail("usage", "Usage: evergreen verify [path]");

      const root = state.positional[0] === undefined ? installedPackageRoot() : resolve(state.positional[0]);
      const directory = await stat(root).catch(() => undefined);
      if (directory === undefined || !directory.isDirectory()) {
        return ctx.fail("usage", `Cannot verify ${root}: it is not a directory.`);
      }

      let result;
      try {
        result = await verifyInstalledRelease(root);
      } catch (error) {
        if (error instanceof ReleaseManifestError) return ctx.failError(error);
        throw error;
      }
      process.stdout.write(`${renderReleaseVerification(result)}\n`);
      return result.ok ? 0 : ctx.exitCodes.policy;
    });
  },
};
