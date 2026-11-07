import { readFile } from "node:fs/promises";
import process from "node:process";

import { CycloneDxError, enrichCycloneDxFile } from "../sbom/cyclonedx.js";
import { SpdxError, enrichSpdxFile } from "../sbom/spdx.js";
import { withPrepared } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "sbom",
  flags: ["--data-version"],
  example: "evergreen sbom enrich bom.json",
  usage: [
    "  evergreen sbom enrich <bom.json> [--data-version <version>]   # print enriched CycloneDX or SPDX 2.3 JSON; leaves the input unchanged",
  ],
  usageSlots: [45],
  run(args, ctx) {
    return withPrepared("sbom", args, ctx, async (state) => {
      const { args: full, dataVersionIndex } = state;
      const operands = full
        .slice(1)
        .filter(
          (_, index) =>
            dataVersionIndex === -1 || (index + 1 !== dataVersionIndex && index + 1 !== dataVersionIndex + 1),
        );
      const path = operands[1];
      if (operands.length !== 2 || operands[0] !== "enrich" || path === undefined || path.startsWith("-")) {
        return ctx.fail("usage", "Usage: evergreen sbom enrich <bom.json> [--data-version <version>]");
      }
      try {
        // SPDX and CycloneDX share this command; detect by spdxVersion when the file parses.
        // Unreadable or invalid JSON falls through to the CycloneDX reader for stable errors.
        let peek: unknown;
        try {
          peek = JSON.parse(await readFile(path, "utf8"));
        } catch {
          peek = undefined;
        }
        const bom =
          peek !== null && typeof peek === "object" && !Array.isArray(peek) && "spdxVersion" in (peek as object)
            ? await enrichSpdxFile(path)
            : await enrichCycloneDxFile(path);
        process.stdout.write(`${JSON.stringify(bom, null, 2)}\n`);
        return 0;
      } catch (error) {
        if (error instanceof CycloneDxError || error instanceof SpdxError) return ctx.failError(error);
        throw error;
      }
    });
  },
};
