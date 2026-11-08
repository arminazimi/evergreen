import type { ManifestEcosystem } from "../schema.js";

const kubernetes: ManifestEcosystem = {
  id: "kubernetes",
  status: "supported",
  maturity: "stable",
  detectorIds: ["kubernetes"],
};

export default kubernetes;
