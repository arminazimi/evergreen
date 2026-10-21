import type { Detector } from "../sdk.js";
import { androidDetector } from "./android/index.js";
import { ciImagesDetector } from "./ci-images/index.js";
import { containerDetector } from "./container/index.js";
import { cppDetector } from "./cpp/index.js";
import { dartDetector } from "./dart/index.js";
import { dotnetDetector } from "./dotnet/index.js";
import { goDetector } from "./go/index.js";
import { javaDetector } from "./java/index.js";
import { githubActionsDetector } from "./github-actions.js";
import { kubernetesDetector } from "./kubernetes/index.js";
import { npmDetector } from "./npm.js";
import { phpDetector } from "./php/index.js";
import { pythonDetector } from "./python.js";
import { rubyDetector } from "./ruby/index.js";
import { rustDetector } from "./rust/index.js";
import { serverlessDetector } from "./serverless/index.js";
import { swiftDetector } from "./swift/index.js";

export const builtInDetectors: readonly Detector[] = [
  githubActionsDetector,
  npmDetector,
  phpDetector,
  pythonDetector,
  containerDetector,
  cppDetector,
  dotnetDetector,
  goDetector,
  javaDetector,
  kubernetesDetector,
  rustDetector,
  ciImagesDetector,
  rubyDetector,
  serverlessDetector,
  swiftDetector,
  androidDetector,
  dartDetector,
];
