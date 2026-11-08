import type { Capability } from "../schema.js";

const versionRecommend: Capability = {
  id: "version.recommend",
  status: "supported",
  version: "1",
  description:
    "Recommend which release line of a runtime, image, GitHub Action, or package to write today, from bundled lifecycle data only.",
  ecosystems: [],
};

export default versionRecommend;
