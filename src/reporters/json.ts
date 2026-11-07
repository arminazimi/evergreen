import type { ScanResult } from "../domain.js";
import { REPORTER_API_VERSION, type Reporter } from "./shared.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** `--format json`: the full scan document. */
export const jsonReporter: Reporter = {
  apiVersion: REPORTER_API_VERSION,
  id: "json",
  commands: ["scan", "check", "check-snippet", "receipt"],
  render: renderJson,
};
