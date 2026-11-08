import repositoryScan from "./repository.scan.js";
import deprecationList from "./deprecation.list.js";
import deprecationExplain from "./deprecation.explain.js";
import migrationContextCreate from "./migration.context.create.js";
import migrationVerify from "./migration.verify.js";
import environmentDoctor from "./environment.doctor.js";
import snippetCheck from "./snippet.check.js";
import repositoryRemoteScan from "./repository.remote-scan.js";
import migrationExecute from "./migration.execute.js";
import versionRecommend from "./version.recommend.js";

/** Every capability the manifest lists, in manifest order. Adding one imports its file here. */
export const capabilities = [
  repositoryScan,
  deprecationList,
  deprecationExplain,
  migrationContextCreate,
  migrationVerify,
  environmentDoctor,
  snippetCheck,
  repositoryRemoteScan,
  migrationExecute,
  versionRecommend,
] as const;
