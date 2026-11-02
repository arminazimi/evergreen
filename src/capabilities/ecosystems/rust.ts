import type { ManifestEcosystem } from "../schema.js";

const rust: ManifestEcosystem = {
  id: "rust",
  status: "supported",
  maturity: "stable",
  detectorIds: ["rust"],
};

export default rust;
