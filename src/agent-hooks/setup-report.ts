import type { InitClaudeHooksResult } from "../init-agents.js";

/** What `init --hooks-for <host>` prints for one host hooks file; one shape for every host. */
export function hooksFileReport(result: InitClaudeHooksResult, dryRun: boolean, done: string): string {
  if (result.change === "unchanged")
    return `${result.file} already has the current Evergreen post-edit hook; nothing to change.\n`;
  const verb = result.change === "created" ? "create" : "update";
  if (dryRun) return `Would ${verb} ${result.file}:\n\n${result.diff}\n`;
  return `${result.change === "created" ? "Created" : "Updated"} ${result.file}; ${done}\n`;
}
