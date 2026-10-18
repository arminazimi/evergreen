import type { MaturityLevel } from "./thresholds.js";

/** Decision 0013's levels as the documentation words them. */
export const maturityLabels: Record<MaturityLevel, string> = {
  experimental: "Experimental",
  beta: "Beta",
  stable: "Supported",
};
