import { nodejsScheduleImporter } from "./nodejs.js";
import { pythonReleaseCycleImporter } from "./python.js";
import type { Importer } from "./types.js";

/** Every importer the command line can run. Each importer adds itself here when it lands. */
export const importers: readonly Importer[] = [nodejsScheduleImporter, pythonReleaseCycleImporter];
