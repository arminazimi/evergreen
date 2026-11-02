import { workflowCapabilityIds } from "../constants.js";
import type { CapabilitySurface } from "../schema.js";

const skill: CapabilitySurface = {
  id: "skill",
  kind: "skill",
  status: "supported",
  version: "1",
  entryPoints: ["skills/evergreen-deprecation/SKILL.md"],
  capabilityIds: [...workflowCapabilityIds],
};

export default skill;
