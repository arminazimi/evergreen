import assert from "node:assert/strict";
import { test } from "node:test";

import { bullet, entries, parseSubject, releaseSection } from "../tools/changelog.js";

test("parses conventional subjects with scope, breaking marker, and pull request", () => {
  assert.deepEqual(parseSubject("feat(github-actions): classify SHA pins (#560)"), {
    type: "feat",
    scope: "github-actions",
    breaking: false,
    description: "classify SHA pins",
    pullRequest: "560",
  });
  assert.deepEqual(parseSubject("fix!: drop the v1 output"), { type: "fix", breaking: true, description: "drop the v1 output" });
  assert.equal(parseSubject("Validate the public corpus (#19)"), undefined);
  assert.equal(parseSubject("Merge pull request #5 from x/y"), undefined);
});

test("formats a bullet as an imperative sentence in the changelog's style", () => {
  assert.equal(bullet(parseSubject("feat: add a doctor command. (#7)")!), "- Add a doctor command. (#7)");
  assert.equal(bullet(parseSubject("feat!: rename the output field")!), "- **Breaking:** Rename the output field.");
});

test("keeps feat, fix, and breaking commits, orders them, and reports non-conventional subjects", () => {
  const { bullets, skipped } = entries([
    "docs: add a release checklist (#565)",
    "fix: handle empty lockfiles (#3)",
    "feat: add the npm importer (#2)",
    "chore: bump a dependency",
    "ci: run the corpus weekly",
    "test: cover the parser",
    "refactor!: remove the legacy loader (#4)",
    "feat: add the pypi importer (#1)",
    "Something free-form",
    "",
  ]);
  assert.deepEqual(bullets, [
    "- **Breaking:** Remove the legacy loader. (#4)",
    "- Add the npm importer. (#2)",
    "- Add the pypi importer. (#1)",
    "- Handle empty lockfiles. (#3)",
  ]);
  assert.deepEqual(skipped, ["Something free-form"]);
});

test("moves Unreleased into a dated section, hand-written entries first", () => {
  const changelog = "# Changelog\n\n## Unreleased\n\n- Written by hand.\n\n## 0.1.0 - 2026-10-14\n\n- Old entry.\n";
  assert.equal(
    releaseSection(changelog, "0.2.0", "2026-11-15", ["- Generated one. (#9)"]),
    "# Changelog\n\n## Unreleased\n\n## 0.2.0 - 2026-11-15\n\n- Written by hand.\n- Generated one. (#9)\n\n## 0.1.0 - 2026-10-14\n\n- Old entry.\n",
  );
  assert.equal(
    releaseSection("# Changelog\n\n## Unreleased\n", "0.2.0", "2026-11-15", ["- Only generated."]),
    "# Changelog\n\n## Unreleased\n\n## 0.2.0 - 2026-11-15\n\n- Only generated.\n\n",
  );
  assert.throws(() => releaseSection("# Changelog\n", "0.2.0", "2026-11-15", []), /Unreleased/);
});
