/**
 * Re-exports the agent loop evaluation for direct invocation.
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runAgentLoopEval } from "./index.js";

export * from "./index.js";

async function run(): Promise<void> {
  const result = await runAgentLoopEval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
