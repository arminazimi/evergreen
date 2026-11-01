import process from "node:process";
import { basename, resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { renderStatusCard } from "../status-card.js";
import type { CliCommand } from "./types.js";

/** `status-card`: prints a static SVG summary of one repository's scan. */
export const command: CliCommand = {
  name: "status-card",
  flags: ["--name"],
  example: "evergreen status-card . --name acme/widgets",
  usage: ["  evergreen status-card [path] [--name <label>]   # print a static SVG summary of findings, next end of life, and data age"],
  usageSlots: [17],
  async run(args, ctx) {
    const usageText = "Usage: evergreen status-card [path] [--name <label>]";
    const operands: string[] = [];
    let name: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index]!;
      if (argument === "--name") {
        name = args[index + 1];
        if (name === undefined) return ctx.fail("usage", usageText);
        index += 1;
        continue;
      }
      if (argument.startsWith("-")) return ctx.fail("usage", usageText);
      operands.push(argument);
    }
    if (operands.length > 1) return ctx.fail("usage", usageText);
    const project = resolve(operands[0] ?? ".");
    try {
      const result = await scanRepository(project, builtInDetectors, {});
      process.stdout.write(`${renderStatusCard(result, { repository: name ?? basename(project) })}\n`);
      return 0;
    } catch (error) {
      return ctx.fail("parse", (error as Error).message);
    }
  },
};
