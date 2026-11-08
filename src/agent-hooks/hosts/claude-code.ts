import { initClaudeHooks } from "../../init-agents.js";
import { claudeCodeAdapter } from "../claude-code.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: claudeCodeAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initClaudeHooks({ root, dryRun }),
      dryRun,
      "Claude Code now runs Evergreen after Write, Edit, and MultiEdit.",
    );
  },
};
