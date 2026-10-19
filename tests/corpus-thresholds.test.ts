import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { maturityLabels } from "../benchmarks/maturity.js";
import { detectorOf, findingKey, scoreDetectors, violations } from "../benchmarks/thresholds.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const finding = (ruleId: string, line: number) => ({ ruleId, path: "package.json", line });

test("thresholds name every shipped detector and enforce precision of at least 0.95", async () => {
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  assert.equal(thresholds.schemaVersion, "evergreen.corpus-thresholds.v1");
  assert.deepEqual(Object.keys(thresholds.detectors).sort(), ["ci-images", "container", "dotnet", "github-actions", "go", "java", "kubernetes", "nodejs", "npm", "python", "ruby", "rust"]);
  for (const [name, threshold] of Object.entries(thresholds.detectors)) {
    // The ci-images, container, Go, Java, Kubernetes, Ruby, and Rust detectors are experimental: they are scored and reported, but not enforced yet.
    assert.equal(threshold.stable, !["ci-images", "container", "go", "java", "kubernetes", "ruby", "rust"].includes(name), name);
    assert.ok(threshold.minPrecision >= 0.95);
  }
});

test("scores each detector by the family of its rule ids", () => {
  assert.equal(detectorOf("npm.package.request.deprecated"), "npm");
  const request = finding("npm.package.request.deprecated", 3);
  const sass = finding("npm.package.node-sass.eol", 9);
  const node = finding("nodejs.runtime.eol-20", 5);
  const scores = scoreDetectors([
    { findings: [request, sass, node], unexpected: [findingKey(sass)], missing: [findingKey(finding("python.runtime.eol-3.9-and-older", 1))] },
  ]);
  assert.deepEqual(scores.npm, { truePositives: 1, falsePositives: 1, falseNegatives: 0, precision: 0.5 });
  assert.deepEqual(scores.nodejs, { truePositives: 1, falsePositives: 0, falseNegatives: 0, precision: 1 });
  assert.deepEqual(scores.python, { truePositives: 0, falsePositives: 0, falseNegatives: 1, precision: 1 });
});

test("a stable detector below its floor is a violation; an experimental one or a missing one is not", () => {
  const thresholds: Thresholds = {
    schemaVersion: "evergreen.corpus-thresholds.v1",
    detectors: {
      npm: { level: "stable", stable: true, minPrecision: 0.95 },
      python: { level: "beta", stable: true, minPrecision: 0.95 },
      nodejs: { level: "experimental", stable: false, minPrecision: 0.99 },
    },
  };
  const scores = {
    npm: { truePositives: 9, falsePositives: 1, falseNegatives: 0, precision: 0.9 },
    nodejs: { truePositives: 1, falsePositives: 9, falseNegatives: 0, precision: 0.1 },
  };
  assert.deepEqual(violations(scores, thresholds), [{ detector: "npm", precision: 0.9, minPrecision: 0.95 }]);
  assert.deepEqual(violations({ npm: { truePositives: 19, falsePositives: 1, falseNegatives: 0, precision: 0.95 } }, thresholds), []);
});

import { countEvidence, earnedLevel, evidenceMinimums } from "../benchmarks/thresholds.js";

// Decision 0013. The corpus ecosystems each detector reads, and the label its row has in docs/COMPATIBILITY.md.
const ECOSYSTEMS: Record<string, { corpus: string[]; row: string }> = {
  "ci-images": { corpus: ["ci-images"], row: "CI runner images" },
  container: { corpus: ["container"], row: "Container base images" },
  dotnet: { corpus: ["dotnet"], row: ".NET" },
  "github-actions": { corpus: ["node-actions"], row: "GitHub Actions" },
  go: { corpus: ["go"], row: "Go" },
  java: { corpus: ["java"], row: "Java and Kotlin (JVM)" },
  kubernetes: { corpus: ["kubernetes"], row: "Kubernetes APIs" },
  nodejs: { corpus: ["node"], row: "Node.js and npm" },
  npm: { corpus: ["node"], row: "Node.js and npm" },
  python: { corpus: ["python"], row: "Python" },
  ruby: { corpus: ["ruby"], row: "Ruby" },
  rust: { corpus: ["rust"], row: "Rust" },
};
// Detectors that held the `Supported` label before the evidence rules existed. They keep it until the corpus
// grows (#141, #142); the test fails if one of them starts to meet its level, so the entry is removed.
const GRANDFATHERED = new Set(["github-actions", "nodejs", "npm", "python"]);

test("earnedLevel follows the evidence minimums", () => {
  const none = { repositoriesWithFindings: 0, expectedFindings: 0, zeroFindingRepositories: 0, repositories: 0, blindRepositories: 0 };
  const enough = (level: "beta" | "stable") => {
    const { blindShare: _blindShare, ...counts } = evidenceMinimums[level];
    return { ...counts, repositories: 10, blindRepositories: Math.ceil(10 * evidenceMinimums[level].blindShare) };
  };
  assert.equal(earnedLevel(none), "experimental");
  assert.equal(earnedLevel(enough("beta")), "beta");
  assert.equal(earnedLevel({ ...enough("stable"), zeroFindingRepositories: 3 }), "beta");
  assert.equal(earnedLevel(enough("stable")), "stable");
  assert.equal(earnedLevel({ ...enough("beta"), expectedFindings: 14 }), "experimental");
});

test("a level needs its share of blind-selected repositories; an unrecorded selection counts as not blind", () => {
  const entry = (repository: string, selection?: "blind" | "targeted") => ({ repository, ecosystem: "dotnet", ...(selection ? { selection } : {}), expected: [] as Array<{ ruleId: string }> });
  const corpus = [entry("a", "blind"), entry("b", "targeted"), entry("c"), entry("d", "blind")];
  assert.deepEqual(countEvidence(corpus, "dotnet", ["dotnet"]), {
    repositoriesWithFindings: 0,
    expectedFindings: 0,
    zeroFindingRepositories: 4,
    repositories: 4,
    blindRepositories: 2,
  });
  const base = { repositoriesWithFindings: 8, expectedFindings: 15, zeroFindingRepositories: 2, repositories: 10 };
  assert.equal(earnedLevel({ ...base, blindRepositories: 5 }), "beta");
  assert.equal(earnedLevel({ ...base, blindRepositories: 4 }), "experimental");
});

test("each detector's level agrees with its enforcement flag, its documented status, and its corpus evidence", async () => {
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  const corpus = (JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: Parameters<typeof countEvidence>[0] }).repositories;
  const compatibility = await readFile(resolve("docs/COMPATIBILITY.md"), "utf8");
  const rank = { experimental: 0, beta: 1, stable: 2 } as const;
  for (const [name, threshold] of Object.entries(thresholds.detectors)) {
    assert.equal(threshold.stable, threshold.level !== "experimental", `${name}: stable must be true exactly for beta and stable`);
    const info = ECOSYSTEMS[name];
    assert.ok(info, `${name} is missing from the table in this test`);
    assert.ok(compatibility.includes(`| ${info.row} | ${maturityLabels[threshold.level]} |`), `docs/COMPATIBILITY.md must show ${info.row} as ${maturityLabels[threshold.level]}`);
    const earned = earnedLevel(countEvidence(corpus, name, info.corpus));
    if (GRANDFATHERED.has(name)) {
      assert.ok(rank[earned] < rank[threshold.level], `${name} now earns ${threshold.level}; remove it from GRANDFATHERED`);
    } else {
      assert.ok(rank[earned] >= rank[threshold.level], `${name} is ${threshold.level} but its corpus evidence only supports ${earned}`);
    }
  }
});

test("the thresholds file records the full corpus run its levels rest on", async () => {
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  const run = thresholds.lastFullRun;
  assert.ok(run, "lastFullRun is recorded");
  assert.match(run.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(run.repositories >= 85);
  const detectors = Object.values(run.perDetector);
  assert.equal(detectors.reduce((sum, item) => sum + item.truePositives + item.falsePositives, 0), run.findings);
  assert.deepEqual(Object.keys(run.perDetector).sort(), Object.keys(thresholds.detectors).sort());
});
