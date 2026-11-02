import type { Capability } from "../schema.js";

const repositoryRemoteScan: Capability = {
  id: "repository.remote-scan",
  status: "unsupported",
  version: "1",
  description: "Upload a repository to a hosted Evergreen scanner.",
  ecosystems: [],
};

export default repositoryRemoteScan;
