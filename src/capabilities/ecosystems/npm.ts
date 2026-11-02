import type { ManifestEcosystem } from "../schema.js";

const npm: ManifestEcosystem = {
  id: "npm",
  status: "supported",
  maturity: "stable",
  detectorIds: ["npm"],
};

export default npm;
