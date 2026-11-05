import { readFile, writeFile } from "node:fs/promises";
import { findCandidates } from "./find.js";
import { queryPlan } from "./profiles.js";

const args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === "--plan") {
    console.log(JSON.stringify(queryPlan(), null, 2));
  } else {
    const [input, output] = args;
    if (args.length !== 2 || !input || !output) {
      throw new Error("Usage: node dist/benchmarks/candidates/cli.js <sources.json> <candidates.json> | --plan");
    }
    const report = findCandidates(JSON.parse(await readFile(input, "utf8")));
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    for (const bucket of report.buckets) {
      console.log(
        `${bucket.ecosystem}: ${bucket.candidates.length}/300 candidates; ${bucket.eligible} eligible; shortfall ${bucket.shortfall}`,
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
