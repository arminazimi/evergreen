import type { ManifestEcosystem } from "../schema.js";

const serverless: ManifestEcosystem = {
  id: "serverless",
  status: "supported",
  maturity: "stable",
  detectorIds: ["serverless"],
};

export default serverless;
