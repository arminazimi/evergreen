import type { ManifestEcosystem } from "../schema.js";

const dotnet: ManifestEcosystem = {
  id: "dotnet",
  status: "supported",
  maturity: "stable",
  detectorIds: ["dotnet"],
};

export default dotnet;
