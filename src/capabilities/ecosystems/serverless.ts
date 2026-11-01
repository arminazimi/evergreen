import type { ManifestEcosystem } from "../schema.js";

const serverless: ManifestEcosystem = {
  id: "serverless",
  status: "supported",
  maturity: "beta",
  detectorIds: ["serverless"],
};

export default serverless;
