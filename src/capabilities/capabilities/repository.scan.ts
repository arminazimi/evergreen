import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const repositoryScan: Capability = {
  id: "repository.scan",
  status: "supported",
  version: "1",
  description: "Scan a local repository with all built-in lifecycle detectors.",
  ecosystems: [...scanEcosystemIds],
};

export default repositoryScan;
