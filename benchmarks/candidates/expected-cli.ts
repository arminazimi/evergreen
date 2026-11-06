// Generates unreviewed expected findings from local checkouts of a frozen candidate batch, and reports
// reviewed and unreviewed counts separately. Neither mode fetches anything or executes repository code.

import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { builtInDetectors } from "../../src/detectors/index.js";
import { scanRepository } from "../../src/engine/index.js";
import { loadPublicCorpus } from "../public-corpus.js";
import {
  countCorpus,
  countUnreviewed,
  formatCorpusCounts,
  loadUnreviewedCorpus,
  UNREVIEWED_CORPUS_DIR,
  writeUnreviewedCorpus,
} from "../unreviewed-corpus.js";
import { generateExpectedFindings } from "./expected.js";

const USAGE = [
  "Usage:",
  "  node dist/benchmarks/candidates/expected-cli.js generate <candidates.json> <checkouts-dir> <output-dir>",
  "  node dist/benchmarks/candidates/expected-cli.js report [unreviewed-dir]",
].join("\n");

const args = process.argv.slice(2);
const [command, ...rest] = args;

try {
  if (command === "generate") {
    const [candidatesPath, checkoutsDir, outputDir] = rest;
    if (rest.length !== 3 || !candidatesPath || !checkoutsDir || !outputDir) throw new Error(USAGE);
    // Record the bundled lifecycle data, not a maintainer's downloaded cache, so the batch is reproducible.
    process.env.EVERGREEN_DATA_DIR ??= join(tmpdir(), `evergreen-unreviewed-no-data-cache-${process.pid}`);
    const reviewed = await loadPublicCorpus();
    const result = await generateExpectedFindings({
      candidates: JSON.parse(await readFile(candidatesPath, "utf8")),
      checkoutsDir,
      generatedAt: new Date().toISOString().slice(0, 10),
      scan: async (path) => scanRepository(path, builtInDetectors),
      reviewedRepositories: new Set(reviewed.repositories.map((entry) => entry.repository)),
    });
    for (const failure of result.failures) console.error(`FAILED ${failure.repository}: ${failure.reason}`);
    if (result.failures.length > 0) {
      console.error(
        `Refusing to write a partial batch: ${result.failures.length} checkouts failed and ${result.entries.length} succeeded.`,
      );
      process.exitCode = 1;
    } else {
      const written = await writeUnreviewedCorpus(outputDir, result.entries);
      console.log(formatCorpusCounts(countCorpus(reviewed.repositories), countUnreviewed(result.entries)));
      console.log(
        `Wrote ${result.entries.length} unreviewed repositories to ${written.length} ecosystem files under ${outputDir}.`,
      );
      console.log(
        `Skipped ${result.skippedIneligible} ineligible candidates and ${result.skippedReviewed} already-reviewed repositories.`,
      );
      console.log(
        "Unreviewed findings are scan output, not precision evidence; review them before moving a pin to benchmarks/public-repositories/.",
      );
    }
  } else if (command === "report") {
    if (rest.length > 1) throw new Error(USAGE);
    const reviewed = await loadPublicCorpus();
    const unreviewed = await loadUnreviewedCorpus(rest[0] ?? UNREVIEWED_CORPUS_DIR);
    console.log(formatCorpusCounts(countCorpus(reviewed.repositories), countUnreviewed(unreviewed)));
    console.log(
      "Only reviewed entries count toward precision, recall, maturity evidence, and the 200-repository target.",
    );
  } else {
    throw new Error(USAGE);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
