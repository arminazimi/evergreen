import type { ManifestEcosystem } from "../schema.js";

// deno and bun share the deno detector, so both take its level.
const bun: ManifestEcosystem = {
  id: "bun",
  status: "supported",
  maturity: "stable",
  detectorIds: ["deno"],
};

export default bun;
