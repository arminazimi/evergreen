import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseTag } from "../tools/sha-tags.js";

const sha = "a".repeat(40);

test("two tags in one major keep the higher tag, whatever the order", () => {
  assert.equal(chooseTag("actions/stale", sha, "v1.0.2", "v1.0.1"), "v1.0.2");
  assert.equal(chooseTag("actions/stale", sha, "v1.0.1", "v1.0.2"), "v1.0.2");
  assert.equal(chooseTag("actions/stale", sha, "v2.9.0", "v2.10.0"), "v2.10.0");
  assert.equal(chooseTag("actions/stale", sha, "v2.10.0", "v2.9.9"), "v2.10.0");
});

test("tags in different majors for one commit are an error", () => {
  assert.throws(() => chooseTag("actions/stale", sha, "v1.9.0", "v2.0.0"), /conflicting tags v1\.9\.0 and v2\.0\.0/);
});

test("anything but an exact release tag is rejected", () => {
  assert.throws(() => chooseTag("actions/stale", sha, "v1", "v1.0.0"), /Not an exact release tag/);
});
