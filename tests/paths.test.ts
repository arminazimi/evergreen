import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { relativePosix, toPosixPath } from "../src/paths.js";

test("rewrites Windows separators and leaves POSIX paths alone", () => {
  assert.equal(toPosixPath(".github\\workflows\\ci.yml", "\\"), ".github/workflows/ci.yml");
  assert.equal(toPosixPath(".github/workflows/ci.yml", "/"), ".github/workflows/ci.yml");
  assert.equal(toPosixPath("package.json", "\\"), "package.json");
});

test("relative paths use forward slashes on every platform", () => {
  const root = join("some", "repo");
  assert.equal(relativePosix(root, join(root, ".github", "workflows", "ci.yml")), ".github/workflows/ci.yml");
  assert.equal(relativePosix(root, join(root, "package.json")), "package.json");
});
