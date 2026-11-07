import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  diffFindings,
  diffRegistryFile,
  diffReleases,
  explainChanges,
  explainRule,
  sortDataTags,
  unexplained,
} from "../benchmarks/data-replay.js";
import { loadPublicCorpus } from "../benchmarks/public-corpus.js";

const rule = (id: string, extra: Record<string, unknown> = {}) => ({ id, severity: "high", sources: [], ...extra });

test("data tags sort by date and revision, and other tags are ignored", () => {
  assert.deepEqual(
    sortDataTags(["data-v2026.10.21", "v0.7.2", "data-v2026.10.21.2", "data-v2026.10.18", "data-v2026.10.21.10"]),
    ["data-v2026.10.18", "data-v2026.10.21", "data-v2026.10.21.2", "data-v2026.10.21.10"],
  );
});

test("findings that appear or disappear are reported once each, and unchanged ones are not", () => {
  const changes = diffFindings(
    "o/r",
    [
      { ruleId: "a.one", path: "package.json", line: 3 },
      { ruleId: "a.two", path: "package.json", line: 4 },
    ],
    [
      { ruleId: "a.two", path: "package.json", line: 4 },
      { ruleId: "a.three", path: "package.json", line: 5 },
      { ruleId: "a.three", path: "package.json", line: 5 },
    ],
  );
  assert.deepEqual(
    changes.map((change) => `${change.kind} ${change.ruleId}`),
    ["disappeared a.one", "appeared a.three"],
  );
});

test("rule changes are added, removed, or changed; a re-review alone is not a change", () => {
  const before = { rules: [rule("x.keep"), rule("x.edit"), rule("x.drop"), rule("x.review")] };
  const after = {
    rules: [
      rule("x.keep"),
      rule("x.edit", { severity: "low" }),
      rule("x.new"),
      rule("x.review", {
        sources: [{ url: "https://example.com", accessedAt: "2026-11-01" }],
        provenance: { reviewedAt: "2026-11-01" },
      }),
    ],
  };
  assert.deepEqual(
    diffRegistryFile("registry/x.json", before, after).map((item) => `${item.ruleId}:${item.change}`),
    ["x.drop:removed", "x.edit:changed", "x.new:added"],
  );
});

test("a finding is explained by its rule or a rule it extends, and github-actions findings by the SHA map", () => {
  const difference = diffReleases(
    { "registry/x.json": { rules: [rule("x.rule")] }, "registry/github-actions-shas.json": { actions: {} } },
    {
      "registry/x.json": { rules: [rule("x.rule", { severity: "low" })] },
      "registry/github-actions-shas.json": { actions: { a: 1 } },
    },
  );
  assert.match(explainRule("x.rule", difference) ?? "", /x\.rule was changed/);
  assert.match(explainRule("x.rule.child", difference) ?? "", /x\.rule was changed/);
  assert.equal(explainRule("x.ruler", difference), undefined);
  assert.match(explainRule("github-actions.pin.sha", difference) ?? "", /github-actions-shas/);
  assert.equal(explainRule("npm.package.other", difference), undefined);
});

test("a change no data difference explains is reported as unexplained", () => {
  const difference = diffReleases(
    { "registry/x.json": { rules: [rule("x.rule")] } },
    { "registry/x.json": { rules: [rule("x.rule")] } },
  );
  const changes = explainChanges(diffFindings("o/r", [], [{ ruleId: "x.rule", path: "a", line: 1 }]), difference);
  assert.equal(unexplained(changes).length, 1);
});

test("every replay repository is pinned in the public corpus at the same commit", async () => {
  const file = JSON.parse(await readFile(resolve("benchmarks/data-replay/repositories.json"), "utf8")) as {
    repositories: Array<{ repository: string; commit: string; ecosystem: string }>;
  };
  const corpus = new Map((await loadPublicCorpus()).repositories.map((entry) => [entry.repository, entry]));
  assert.ok(file.repositories.length >= 12);
  for (const entry of file.repositories) {
    const pinned = corpus.get(entry.repository);
    assert.ok(pinned, `${entry.repository} is not in the public corpus`);
    assert.equal(pinned.commit, entry.commit, `${entry.repository} is pinned at a different commit`);
    assert.equal(pinned.ecosystem, entry.ecosystem);
  }
});
