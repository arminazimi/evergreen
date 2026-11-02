import type { ManifestEcosystem } from "../schema.js";

// nodejs and npm share the npm detector, so both take its level.
const nodejs: ManifestEcosystem = {
  id: "nodejs",
  status: "supported",
  maturity: "stable",
  detectorIds: ["npm"],
};

export default nodejs;
