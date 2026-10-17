import { containerOfficialImagesImporter } from "./container.js";
import { endoflifeDateImporter } from "./endoflife.js";
import { githubActionsRuntimeImporter } from "./github-actions.js";
import { goModuleDeprecationImporter } from "./go-2.js";
import { goReleasePolicyImporter } from "./go-1.js";
import { kubernetesDeprecationGuideImporter } from "./kubernetes-1.js";
import { nodejsScheduleImporter } from "./nodejs.js";
import { npmDeprecatedImporter } from "./npm.js";
import { pypiStatusImporter } from "./pypi.js";
import { pythonReleaseCycleImporter } from "./python.js";
import { runnerImagesImporter } from "./runner-images.js";
import type { Importer } from "./types.js";

/** Every importer the command line can run. Each importer adds itself here when it lands. */
export const importers: readonly Importer[] = [containerOfficialImagesImporter, endoflifeDateImporter, githubActionsRuntimeImporter, goModuleDeprecationImporter, goReleasePolicyImporter, kubernetesDeprecationGuideImporter, nodejsScheduleImporter, npmDeprecatedImporter, pypiStatusImporter, pythonReleaseCycleImporter, runnerImagesImporter];
