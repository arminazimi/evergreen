import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { childPosixPath, relativePosix, toPosixPath } from "../src/paths.js";

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

test("builds a child path on the prefix the walk already carries", () => {
  assert.equal(childPosixPath("", "package.json"), "package.json");
  assert.equal(childPosixPath(".github", "workflows"), ".github/workflows");
  assert.equal(childPosixPath(".github/workflows", "ci.yml"), ".github/workflows/ci.yml");
});
