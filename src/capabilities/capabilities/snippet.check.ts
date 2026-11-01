import { scanEcosystemIds } from "../ecosystems/index.js";
import type { Capability } from "../schema.js";

const snippetCheck: Capability = {
  id: "snippet.check",
  status: "supported",
  version: "1",
  description: "Check one file snippet before writing it, in an isolated temporary directory.",
  ecosystems: [...scanEcosystemIds],
};

export default snippetCheck;
