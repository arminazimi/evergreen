import { initCopilotHooks } from "../../init-agents.js";
import { copilotAdapter } from "../copilot.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: copilotAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initCopilotHooks({ root, dryRun }),
      dryRun,
      "GitHub Copilot now runs Evergreen after create and edit.",
    );
  },
};
