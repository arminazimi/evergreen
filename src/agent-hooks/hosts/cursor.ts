import { initCursorHooks } from "../../init-agents.js";
import type { InitCursorHooksResult } from "../../init-agents.js";
import { cursorAdapter } from "../cursor.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

/** What `init` prints for the Cursor rule that accompanies the hooks-file merge. */
function ruleReport(result: InitCursorHooksResult["rule"], dryRun: boolean): string {
  if (result.change === "unchanged")
    return `${result.file} already has the current Evergreen section; nothing to change.\n`;
  if (dryRun) {
    const verb =
      result.change === "created" ? "create" : result.change === "added" ? "add the Evergreen section to" : "update";
    return `Would ${verb} ${result.file}:\n\n${result.diff}\n`;
  }
  if (result.change === "created") return `Created ${result.file}.\n`;
  if (result.change === "added") return `Added the Evergreen section to ${result.file}.\n`;
  return `Updated the Evergreen section in ${result.file}.\n`;
}

export const hostHook: HostHook = {
  adapter: cursorAdapter,
  async setup({ root, dryRun }) {
    const result = await initCursorHooks({ root, dryRun });
    return (
      hooksFileReport(
        result.hooks,
        dryRun,
        "Cursor now runs Evergreen afterFileEdit (audit log only; the agent reads .cursor/rules/evergreen.mdc).",
      ) + ruleReport(result.rule, dryRun)
    );
  },
};
