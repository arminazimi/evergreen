import { initGeminiHooks } from "../../init-agents.js";
import { geminiAdapter } from "../gemini.js";
import { hooksFileReport } from "../setup-report.js";
import type { HostHook } from "../types.js";

export const hostHook: HostHook = {
  adapter: geminiAdapter,
  async setup({ root, dryRun }) {
    return hooksFileReport(
      await initGeminiHooks({ root, dryRun }),
      dryRun,
      "Gemini CLI now runs Evergreen after write_file and replace.",
    );
  },
};
