import { androidTargetSdkImporter } from "./android-1.js";
import { ciImagesImporter } from "./ci-images-1.js";
import { containerOfficialImagesImporter } from "./container.js";
import { cmakePolicyImporter } from "./cpp-1.js";
import { dotnetReleasesImporter } from "./dotnet-1.js";
import { nugetDeprecationImporter } from "./dotnet-2.js";
import { endoflifeDateImporter } from "./endoflife.js";
import { githubActionsRuntimeImporter } from "./github-actions.js";
import { goModuleDeprecationImporter } from "./go-2.js";
import { goReleasePolicyImporter } from "./go-1.js";
import { javaJdkSupportImporter } from "./java-1.js";
import { mavenRelocationImporter } from "./java-2.js";
import { kubernetesDeprecationGuideImporter } from "./kubernetes-1.js";
import { kubernetesReleasesImporter } from "./kubernetes-2.js";
import { rustToolchainImporter } from "./rust-1.js";
import { rustYankedImporter } from "./rust-2.js";
import { nodejsScheduleImporter } from "./nodejs.js";
import { npmDeprecatedImporter } from "./npm.js";
import { pypiStatusImporter } from "./pypi.js";
import { pythonReleaseCycleImporter } from "./python.js";
import { rubyMaintenanceImporter } from "./ruby-1.js";
import { runnerImagesImporter } from "./runner-images.js";
import { swiftAppStoreImporter } from "./swift-1.js";
import type { Importer } from "./types.js";

/** Every importer the command line can run. Each importer adds itself here when it lands. */
export const importers: readonly Importer[] = [androidTargetSdkImporter, ciImagesImporter, containerOfficialImagesImporter, cmakePolicyImporter, dotnetReleasesImporter, nugetDeprecationImporter, endoflifeDateImporter, githubActionsRuntimeImporter, goModuleDeprecationImporter, goReleasePolicyImporter, javaJdkSupportImporter, mavenRelocationImporter, kubernetesDeprecationGuideImporter, kubernetesReleasesImporter, nodejsScheduleImporter, npmDeprecatedImporter, pypiStatusImporter, pythonReleaseCycleImporter, runnerImagesImporter, rubyMaintenanceImporter, rustToolchainImporter, rustYankedImporter, swiftAppStoreImporter];
