import { getHeapStatistics } from "node:v8";
import { EvergreenError } from "../evergreen-error.js";

/** Share of the V8 heap limit a scan may use before it stops with a clear error instead of crashing. */
const heapUseLimit = 0.85;

/** Heap the limit reports but old space cannot use (young generation and runtime overhead). */
const reservedBytes = 64 * 1024 * 1024;

/** How many files pass between two heap checks; reading the statistics is cheap but not free. */
const checkEvery = 50;

/** Raised when a scan would exhaust the heap, so the caller sees a message instead of a V8 abort. */
export class ScanMemoryError extends EvergreenError {
  constructor(usedBytes: number, limitBytes: number) {
    const megabytes = (bytes: number): number => Math.round(bytes / 1024 / 1024);
    super(
      "scan-memory-exceeded",
      `Scan stopped: the heap reached ${megabytes(usedBytes)} MB of its ${megabytes(limitBytes)} MB limit.`,
    );
    this.name = "ScanMemoryError";
  }
}

/** Returns a function to call once per file; it throws {@link ScanMemoryError} when the heap is nearly full. */
export function openMemoryGuard(
  statistics: () => { used_heap_size: number; heap_size_limit: number } = getHeapStatistics,
): () => void {
  let seen = 0;
  return () => {
    seen += 1;
    if (seen % checkEvery !== 0) return;
    const { used_heap_size: used, heap_size_limit: limit } = statistics();
    if (used > Math.min(limit * heapUseLimit, limit - reservedBytes)) throw new ScanMemoryError(used, limit);
  };
}
