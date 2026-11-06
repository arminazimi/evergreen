// One repository per worker: the scan runs in its own V8 isolate with a memory ceiling, so a
// repository that exhausts the heap fails alone instead of taking the whole corpus run down.
// The parent is benchmarks/corpus-scan.ts.

import { parentPort, workerData } from "node:worker_threads";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine/index.js";
import type { CorpusScannedFinding } from "./corpus-harness.js";

interface ScanWorkerInput {
  path: string;
}

const input = workerData as ScanWorkerInput;
const scan = await scanRepository(input.path, builtInDetectors);
// Transitive findings (those with a dependency path) have no reviewed ground truth, so the corpus
// scores only declared dependencies. Send the two fields the harness uses, not the whole finding.
const findings: CorpusScannedFinding[] = scan.findings
  .filter((finding) => finding.dependencyPath === undefined)
  .map((finding) => ({
    ruleId: finding.ruleId,
    location: {
      path: finding.location.path,
      ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
    },
  }));

parentPort?.postMessage(findings);
