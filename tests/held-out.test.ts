import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { familyOf, scoreHeldOut } from "../benchmarks/held-out.js";
import { labelFile } from "../benchmarks/held-out/label.js";

const scope = ["github-actions.checkout", "nodejs.runtime"];

test("a rule id belongs to the scope family it extends", () => {
  assert.equal(familyOf("github-actions.checkout.node20", scope), "github-actions.checkout");
  assert.equal(familyOf("nodejs.runtime.eol-18", scope), "nodejs.runtime");
  assert.equal(familyOf("github-actions.checkoutx.node20", scope), undefined);
  assert.equal(familyOf("npm.package.request.deprecated", scope), undefined);
});

test("scoring counts a line once, ignores out-of-scope findings, and reports both kinds of miss", () => {
  const score = scoreHeldOut(
    [
      { ruleId: "nodejs.runtime.eol-18", path: "a.yml", line: 3 },
      { ruleId: "nodejs.runtime.eol-20", path: "a.yml", line: 3 },
      { ruleId: "github-actions.checkout.node20", path: "a.yml", line: 9 },
      { ruleId: "npm.package.request.deprecated", path: "package.json", line: 1 },
    ],
    [
      { family: "nodejs.runtime", path: "a.yml", line: 3 },
      { family: "nodejs.runtime", path: "a.yml", line: 20 },
    ],
    scope,
  );
  assert.deepEqual(score, {
    truePositives: 1,
    falsePositives: 1,
    falseNegatives: 1,
    precision: 0.5,
    recall: 0.5,
    unexpected: ["github-actions.checkout:a.yml:9"],
    missing: ["nodejs.runtime:a.yml:20"],
  });
});

test("the labeller reads Action majors and Node.js versions from the text alone", () => {
  const workflow = [
    "steps:",
    "  - uses: actions/checkout@v4",
    "  - uses: actions/checkout@v5",
    "  - uses: actions/cache@0123456789012345678901234567890123456789 # v3",
    "  - uses: actions/upload-artifact@v3",
    "  - uses: actions/setup-node@v3",
    "    with:",
    "      node-version: [16, 22]",
    "      node-version: 22",
  ].join("\n");
  assert.deepEqual(
    labelFile(".github/workflows/ci.yml", workflow).map((item) => `${item.family}:${item.line}`),
    ["github-actions.checkout:2", "github-actions.cache:4", "github-actions.setup-node:6", "nodejs.runtime:8"],
  );
  assert.deepEqual(labelFile(".nvmrc", "v18.19.0\n"), [{ family: "nodejs.runtime", path: ".nvmrc", line: 1 }]);
  assert.deepEqual(labelFile(".nvmrc", "22\n"), []);
});

test("every held-out repository is blind, pinned, and not in the main corpus; the recorded result matches the set", async () => {
  const held = JSON.parse(await readFile(resolve("benchmarks/held-out-repositories.json"), "utf8")) as { scope: string[]; repositories: Array<{ repository: string; commit: string; selection: string; expected: unknown[] }> };
  const main = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: Array<{ repository: string }> };
  const taken = new Set(main.repositories.map((entry) => entry.repository.toLowerCase()));
  assert.ok(held.repositories.length >= 15);
  for (const entry of held.repositories) {
    assert.equal(entry.selection, "blind", entry.repository);
    assert.match(entry.commit, /^[0-9a-f]{40}$/, entry.repository);
    assert.ok(!taken.has(entry.repository.toLowerCase()), `${entry.repository} is in the main corpus, so it is not held out`);
  }
  const result = JSON.parse(await readFile(resolve("benchmarks/held-out-result.json"), "utf8")) as { scope: string[]; repositories: Array<{ repository: string; commit: string }> };
  assert.deepEqual(result.scope, held.scope);
  assert.deepEqual(result.repositories.map((row) => `${row.repository}@${row.commit}`), held.repositories.map((entry) => `${entry.repository}@${entry.commit}`));
});
