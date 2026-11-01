import type { CapabilitySurface } from "../schema.js";
import { VERSION } from "../../version.js";

const ciGithubActions: CapabilitySurface = {
  id: "ci.github-actions",
  kind: "ci",
  status: "supported",
  version: VERSION,
  entryPoints: ["action.yml", "evergreen"],
  capabilityIds: ["repository.scan", "environment.doctor"],
};

export default ciGithubActions;
