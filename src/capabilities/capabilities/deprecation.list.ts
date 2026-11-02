import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const deprecationList: Capability = {
  id: "deprecation.list",
  status: "supported",
  version: "1",
  description: "List compact lifecycle findings from a fresh local scan.",
  ecosystems: [...scanEcosystemIds],
};

export default deprecationList;
