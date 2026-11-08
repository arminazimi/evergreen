import { initCodexHooks } from "../../init-agents.js";
import { codexAdapter } from "../codex.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: codexAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initCodexHooks({ root, dryRun }),
      dryRun,
      "Codex now runs Evergreen after apply_patch.",
    );
  },
};
