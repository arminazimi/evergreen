import { workflowCapabilityIds } from "../constants.js";
import type { CapabilitySurface } from "../schema.js";
import { VERSION } from "../../version.js";

const mcp: CapabilitySurface = {
  id: "mcp",
  kind: "mcp",
  status: "supported",
  version: VERSION,
  entryPoints: ["evergreen-mcp"],
  capabilityIds: [...workflowCapabilityIds, "snippet.check", "version.recommend"],
};

export default mcp;
