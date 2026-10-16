import type { Detector } from "../sdk.js";
import { containerDetector } from "./container/index.js";
import { githubActionsDetector } from "./github-actions.js";
import { npmDetector } from "./npm.js";
import { pythonDetector } from "./python.js";

export const builtInDetectors: readonly Detector[] = [
  githubActionsDetector,
  npmDetector,
  pythonDetector,
  containerDetector,
];
