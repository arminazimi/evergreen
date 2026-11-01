import { runScanPipeline } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "scan",
  flags: ["--demo", "--json", "--format", "--baseline", "--baseline-warn-days", "--on-expired", "--today", "--write-status", "--interactive", "--fail-on", "--all", "--by-owner", "--data-version", "--only", "--exclude"],
  example: "evergreen scan . --fail-on high",
  usage: [
    "  evergreen scan [path] [--no-cache] [--json | --format <text|json|markdown|junit|sarif|rdjson|codequality|compact|html|slack|teams|webhook|mermaid>]",
    "  evergreen scan --demo [--json | --format <text|json|markdown|junit|sarif|rdjson|codequality|compact|html|slack|teams|webhook|mermaid>]   # scan an in-memory demo project that always has findings",
    "  evergreen scan [path] --baseline <file> [--baseline <file>...] [--baseline-warn-days <n>] [--on-expired resurface|fail] [--today <YYYY-MM-DD>] [--json]",
    "  evergreen scan [path] --as-of <YYYY-MM-DD> [--json]   # scan as the world will look on a date; --today is an alias",
    "  evergreen scan [path] --min-support-days <n>   # warn on lines whose support ends within n days",
    "  evergreen scan [path] --write-status",
    "  evergreen scan [path] --interactive   # browse findings and open them in $EDITOR; plain text when not a terminal",
    "  evergreen scan [path] --fail-on <severity|none>   # exit 1 when a finding is at or above the severity",
    "  evergreen scan [path] --ignore <path>   # ignore paths or glob patterns during scan",
    "  evergreen scan [path] --only <ecosystem|rule-prefix>   # keep only matching findings; repeatable",
    "  evergreen scan [path] --exclude <ecosystem|rule-prefix>   # drop matching findings; repeatable",
    "  evergreen scan [path] --no-cache   # bypass the scan cache and re-scan all files fresh",
    "  evergreen scan <path> <path>... [--all <dir>] [--json]   # several projects, per-project and combined counts",
    "  evergreen scan [path] --by-owner [--json]   # group findings by CODEOWNERS owner; files with no owner are listed as unowned",
  ],
  usageSlots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 30],
  run(args, ctx) {
    return runScanPipeline("scan", args, ctx);
  },
};
