// One repository per child process: the scan runs in its own V8 heap with a ceiling, so a
// repository that exhausts the memory fails alone instead of taking the whole corpus run down.
// Using a process rather than a worker thread keeps that true where a V8 abort is fatal to the
// process (Windows). The parent is benchmarks/corpus-scan.ts.

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine/index.js";
import type { CorpusScannedFinding } from "./corpus-harness.js";
import type { ScanMessage } from "./corpus-scan.js";

const path = process.argv[2];
if (path === undefined) throw new Error("corpus-scan-child needs the repository path as its first argument.");
if (process.send === undefined) throw new Error("corpus-scan-child must be started with an IPC channel.");
const send = process.send.bind(process);

try {
  const scan = await scanRepository(path, builtInDetectors);
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
  send({ findings } satisfies ScanMessage, () => process.exit(0));
} catch (error) {
  // The scan's own guard (src/usage/memory-guard.ts) arrives here with a clear message; a V8 abort
  // does not, and the parent classifies that from the exit signal and stderr instead.
  send({ error: error instanceof Error ? error.message : String(error) } satisfies ScanMessage, () => process.exit(1));
}
