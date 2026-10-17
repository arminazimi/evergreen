import type { Detector } from "../sdk.js";
import { containerDetector } from "./container/index.js";
import { goDetector } from "./go/index.js";
import { javaDetector } from "./java/index.js";
import { githubActionsDetector } from "./github-actions.js";
import { kubernetesDetector } from "./kubernetes/index.js";
import { npmDetector } from "./npm.js";
import { pythonDetector } from "./python.js";

export const builtInDetectors: readonly Detector[] = [
  githubActionsDetector,
  npmDetector,
  pythonDetector,
  containerDetector,
  goDetector,
  javaDetector,
  kubernetesDetector,
];
