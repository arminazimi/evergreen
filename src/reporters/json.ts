import type { ScanResult } from "../domain.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
