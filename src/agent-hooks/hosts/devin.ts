import { initDevinHooks } from "../../init-agents.js";
import { devinAdapter } from "../devin.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: devinAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initDevinHooks({ root, dryRun }),
      dryRun,
      "Devin Local now runs Evergreen after write, edit, and apply_patch.",
    );
  },
};
