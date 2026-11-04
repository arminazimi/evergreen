import assert from "node:assert/strict";
import { test } from "node:test";

import { required } from "../src/required.js";

test("required returns a present value and names a missing one", () => {
  assert.equal(required("constraint bound", "constraint bound"), "constraint bound");
  assert.throws(() => required(undefined, "constraint bound"), /missing constraint bound/);
});
