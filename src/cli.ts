#!/usr/bin/env node

/**
 * The executable entry. It checks the Node.js version before anything else loads: the rest of the CLI may use syntax
 * this Node.js cannot parse, so users on an older Node.js must get the reason here, not an import-time stack trace.
 */

import process from "node:process";

import { renderActionable, unsupportedNodeVersion } from "./errors.js";

const rawArgs = process.argv.slice(2);
const args = rawArgs.filter((argument) => argument !== "--debug");
const jsonErrors = args.includes("--json") || (args.includes("--format") && args[args.indexOf("--format") + 1] === "json");
const nodeProblem = unsupportedNodeVersion();
if (nodeProblem) {
  const { message, appendix } = renderActionable(nodeProblem);
  process.stderr.write(`${message}\n${appendix}`);
  if (jsonErrors) {
    const document = { schemaVersion: "evergreen.error.v1", error: { code: "usage", exitCode: 2, message } };
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  }
  process.exitCode = 2;
} else {
  await import("./cli-main.js");
}
