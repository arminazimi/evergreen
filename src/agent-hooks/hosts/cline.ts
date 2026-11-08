import { initClineHooks } from "../../init-agents.js";
import { clineAdapter } from "../cline.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: clineAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initClineHooks({ root, dryRun }),
      dryRun,
      "Cline now runs Evergreen after write_to_file and replace_in_file; turn on Hooks in Cline's feature settings.",
    );
  },
};
