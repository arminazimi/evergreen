import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const migrationVerify: Capability = {
  id: "migration.verify",
  status: "supported",
  version: "1",
  description: "Re-scan and verify that an observed finding is absent.",
  ecosystems: [...scanEcosystemIds],
};

export default migrationVerify;
