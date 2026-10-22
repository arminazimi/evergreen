// Compares two Evergreen scans of the same repository: the build that passed CI and the package that was published.
//
//   node release-smoke.mjs <built-scan.json> <published-scan.json>
//
// Both files are `scan --json` output. The summary is what must not differ between the two: the findings, the
// unclassified references, and the lifecycle data version. Timestamps and absolute paths are left out. Exits 1,
// printing both summaries, when they differ.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function summarize(scan) {
  return {
    findings: (scan.findings ?? []).map((finding) => `${finding.ruleId} ${finding.id}`).sort(),
    unclassified: (scan.unclassified?.references ?? []).map((reference) => `${reference.component} ${reference.reference}`).sort(),
    dataVersion: scan.data?.version ?? null,
  };
}

export function compareScans(built, published) {
  const left = JSON.stringify(summarize(built), null, 2);
  const right = JSON.stringify(summarize(published), null, 2);
  return left === right ? { match: true } : { match: false, built: left, published: right };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [builtPath, publishedPath] = process.argv.slice(2);
  if (!builtPath || !publishedPath) {
    console.error("Usage: release-smoke.mjs <built-scan.json> <published-scan.json>");
    process.exit(2);
  }
  const outcome = compareScans(JSON.parse(readFileSync(builtPath, "utf8")), JSON.parse(readFileSync(publishedPath, "utf8")));
  if (!outcome.match) {
    console.error(`The published package scans this repository differently from the build that passed CI.\n\nBuilt:\n${outcome.built}\n\nPublished:\n${outcome.published}`);
    process.exit(1);
  }
  console.log("The published package scans this repository exactly like the build that passed CI.");
}
