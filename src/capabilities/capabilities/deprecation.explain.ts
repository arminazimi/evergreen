import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const deprecationExplain: Capability = {
  id: "deprecation.explain",
  status: "supported",
  version: "1",
  description: "Explain one evidence-backed finding by its exact identifier.",
  ecosystems: [...scanEcosystemIds],
};

export default deprecationExplain;
