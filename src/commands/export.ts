import process from "node:process";

import { builtInDetectors } from "../detectors/index.js";
import { scanProjects } from "../engine/index.js";
import { exportActiveCle } from "@velella/ebb/export/cle";
import { exportPortal, portalReportLink } from "../export/portal.js";
import { withPrepared } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "export",
  flags: ["--format", "--data-version", "--report-base-url"],
  example: "evergreen export --format cle",
  usage: [
    "  evergreen export --format cle [--data-version <version>]   # CLE 1.0 snapshots, one JSON document per line and component; skipped rules reported on stderr",
    "  evergreen export --format portal [path...] [--data-version <version>] [--report-base-url <url>]   # developer-portal catalog: severity counts, next end-of-life date, and report link per scanned path",
  ],
  usageSlots: [43, 44],
  run(args, ctx) {
    return withPrepared("export", args, ctx, async (state) => {
      const { args: full, format, formatIndex, dataVersionIndex } = state;
      const reportBaseIndex = full.indexOf("--report-base-url");
      const reportBaseUrl = reportBaseIndex === -1 ? undefined : full[reportBaseIndex + 1];
      if (reportBaseIndex !== -1 && (reportBaseUrl === undefined || reportBaseUrl.startsWith("-"))) {
        return ctx.fail("usage", "--report-base-url needs a URL, for example https://ci.example.com/artifacts/.");
      }
      const operands = full
        .slice(1)
        .filter(
          (_, index) =>
            index + 1 !== formatIndex &&
            index + 1 !== formatIndex + 1 &&
            (dataVersionIndex === -1 || (index + 1 !== dataVersionIndex && index + 1 !== dataVersionIndex + 1)) &&
            (reportBaseIndex === -1 || (index + 1 !== reportBaseIndex && index + 1 !== reportBaseIndex + 1)),
        );
      const exportUsage =
        "Usage: evergreen export --format cle|portal [path...] [--data-version <version>] [--report-base-url <url>]";
      if (format !== "cle" && format !== "portal") return ctx.fail("usage", exportUsage);
      if (format === "cle") {
        if (operands.length > 0 || reportBaseIndex !== -1)
          return ctx.fail("usage", "Usage: evergreen export --format cle [--data-version <version>]");
        const result = await exportActiveCle();
        for (const document of result.documents) process.stdout.write(`${JSON.stringify(document)}\n`);
        if (result.skipped > 0)
          process.stderr.write(
            `Skipped ${result.skipped} rules: CLE requires a dated component lifecycle event; deprecation, removal, symbol rules, and undated rules cannot be faithfully represented.\n`,
          );
        return 0;
      }
      if (operands.some((operand) => operand.startsWith("-"))) return ctx.fail("usage", exportUsage);
      const paths = operands.length > 0 ? operands : ["."];
      const multi = await scanProjects(paths, builtInDetectors, {
        noCache: full.includes("--no-cache") || process.env.EVERGREEN_NO_CACHE === "1",
      });
      const catalog = exportPortal(
        multi.projects.map((project) => ({
          path: project.path,
          findings: project.result.findings,
          reportLink: portalReportLink(project.path, reportBaseUrl),
        })),
      );
      process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
      return 0;
    });
  },
};
