import type { ManifestEcosystem } from "../schema.js";

const kubernetes: ManifestEcosystem = {
  id: "kubernetes",
  status: "supported",
  maturity: "beta",
  detectorIds: ["kubernetes"],
};

export default kubernetes;
