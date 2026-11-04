import type { CapabilitySurface } from "../schema.js";
import { VERSION } from "../../version.js";

const cli: CapabilitySurface = {
  id: "cli",
  kind: "cli",
  status: "supported",
  version: VERSION,
  entryPoints: ["evergreen"],
  capabilityIds: [
    "repository.scan",
    "deprecation.list",
    "deprecation.explain",
    "migration.context.create",
    "environment.doctor",
    "snippet.check",
  ],
};

export default cli;
