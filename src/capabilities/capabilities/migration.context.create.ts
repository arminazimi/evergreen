import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const migrationContextCreate: Capability = {
  id: "migration.context.create",
  status: "supported",
  version: "1",
  description: "Create a validated migration packet for one finding.",
  ecosystems: [...scanEcosystemIds],
};

export default migrationContextCreate;
