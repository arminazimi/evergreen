import type { Capability } from "../schema.js";

const migrationExecute: Capability = {
  id: "migration.execute",
  status: "unsupported",
  version: "1",
  description: "Execute migration edits or suggested verification commands automatically.",
  ecosystems: [],
};

export default migrationExecute;
