// The nightly workflow splits the mutation scope across shards. A shard's score covers only its
// slice, so it is not the overall score the break threshold in stryker.config.json applies to: the
// diff shard, for example, is below 60 while the complete run is above 80. The mutation report job
// enforces the overall break on the merged report; shards run with the same config and no break.
import config from "./stryker.config.json" with { type: "json" };

export default {
  ...config,
  thresholds: { ...config.thresholds, break: null },
};
