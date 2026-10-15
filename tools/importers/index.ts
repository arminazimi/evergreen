import { githubActionsRuntimeImporter } from "./github-actions.js";
import { nodejsScheduleImporter } from "./nodejs.js";
import { npmDeprecatedImporter } from "./npm.js";
import { pypiStatusImporter } from "./pypi.js";
import { pythonReleaseCycleImporter } from "./python.js";
import { runnerImagesImporter } from "./runner-images.js";
import type { Importer } from "./types.js";

/** Every importer the command line can run. Each importer adds itself here when it lands. */
export const importers: readonly Importer[] = [githubActionsRuntimeImporter, nodejsScheduleImporter, npmDeprecatedImporter, pypiStatusImporter, pythonReleaseCycleImporter, runnerImagesImporter];
