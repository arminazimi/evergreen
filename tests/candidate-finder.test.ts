import assert from "node:assert/strict";
import { test } from "node:test";
import { findCandidates } from "../benchmarks/candidates/find.js";
import { ecosystems, matchesForm, profiles, queryPlan, type Ecosystem } from "../benchmarks/candidates/profiles.js";
import type { Evidence, Snapshot } from "../benchmarks/candidates/snapshot.js";

const pin = "a".repeat(40);
const tree = "b".repeat(40);
function item(id = 1, path = "package.json"): Evidence {
  return {
    repository: {
      id,
      full_name: `owner/project-${id.toString().padStart(4, "0")}`,
      private: false,
      fork: false,
      archived: false,
      mirror_url: null,
      size: 5000,
      default_branch: "main",
    },
    ref: "main",
    commit: { sha: pin, commit: { committer: { date: "2026-11-01T00:00:00Z" }, tree: { sha: tree } } },
    tree: {
      sha: tree,
      truncated: false,
      tree: [
        { path, type: "blob" },
        { path: "LICENSE", type: "blob" },
      ],
    },
    licenseReview: {
      commit: pin,
      path: "LICENSE",
      spdxId: "MIT",
      osiApproved: true,
      coversInputs: true,
      reviewer: "maintainer",
    },
  };
}
function snapshot(items: Evidence[], ecosystem: Ecosystem = "node"): Snapshot {
  return {
    schemaVersion: "evergreen.candidate-sources.v1",
    discoveredAt: "2026-11-05",
    sources: [
      {
        ecosystem,
        query: "filename:package.json fork:false",
        url: "https://github.com/search?q=package.json&type=code",
        limit: 1000,
        incomplete: false,
        items,
      },
    ],
  };
}
function bucket(input: Snapshot, count = 300) {
  const result = findCandidates(input, count).buckets.find((entry) => entry.ecosystem === input.sources[0]?.ecosystem);
  assert.ok(result);
  return result;
}

test("returns 300 immutable candidates per each of 23 ecosystems, independent of input ranking", () => {
  const sources = ecosystems.map((ecosystem, index) => {
    const path = profiles[ecosystem][0].replaceAll("*", "project");
    return snapshot(
      Array.from({ length: 305 }, (_, offset) => item(index * 1000 + offset + 1, path)),
      ecosystem,
    ).sources[0];
  });
  const input = { ...snapshot([]), sources };
  const report = findCandidates(input);
  assert.equal(report.buckets.length, 23);
  for (const entry of report.buckets) {
    assert.equal(entry.candidates.length, 300);
    assert.equal(entry.eligible, 300);
    assert.equal(entry.shortfall, 0);
    assert.equal(entry.remaining, 5);
    assert.equal(entry.reviewedCorpusCount, 0);
    assert.ok(entry.candidates.every((candidate) => candidate.commit === pin));
  }
  assert.deepEqual(
    findCandidates({
      ...input,
      sources: sources.map((source) => ({ ...source, items: [...(source?.items ?? [])].reverse() })),
    }),
    report,
  );
});

test("retains failures and every rule result instead of padding a shortfall", () => {
  const invalid = item();
  invalid.repository.fork = true;
  invalid.repository.size = 50001;
  invalid.commit = null;
  invalid.tree = null;
  invalid.licenseReview = null;
  const result = bucket(snapshot([invalid]));
  assert.equal(result.shortfall, 299);
  assert.equal(result.eligible, 0);
  assert.deepEqual(result.candidates[0]?.reasons, [
    "independent",
    "pin",
    "activity",
    "size",
    "tree",
    "license",
    "ecosystem",
  ]);
  assert.equal(result.candidates[0]?.commit, null);
  assert.equal(findCandidates(snapshot([])).buckets[0]?.shortfall, 300);
});

test("requires pinned tree, default branch, activity, and license review at the same commit", () => {
  const mutations: Array<[string, (value: Evidence) => void]> = [
    [
      "independent",
      (value) => {
        value.repository.private = true;
      },
    ],
    [
      "independent",
      (value) => {
        value.repository.archived = true;
      },
    ],
    [
      "independent",
      (value) => {
        value.repository.mirror_url = "https://example.org/mirror";
      },
    ],
    [
      "pin",
      (value) => {
        value.ref = "other";
      },
    ],
    [
      "activity",
      (value) => {
        if (value.commit) value.commit.commit.committer.date = "2024-11-04T23:59:59Z";
      },
    ],
    [
      "activity",
      (value) => {
        if (value.commit) value.commit.commit.committer.date = "2026-11-06T00:00:00Z";
      },
    ],
    [
      "tree",
      (value) => {
        if (value.tree) value.tree.truncated = true;
      },
    ],
    [
      "tree",
      (value) => {
        if (value.tree) value.tree.sha = pin;
      },
    ],
    [
      "license",
      (value) => {
        if (value.licenseReview) value.licenseReview.commit = tree;
      },
    ],
    [
      "license",
      (value) => {
        if (value.licenseReview) value.licenseReview.path = "MISSING";
      },
    ],
    [
      "license",
      (value) => {
        if (value.licenseReview) value.licenseReview.osiApproved = false;
      },
    ],
    [
      "license",
      (value) => {
        if (value.licenseReview) value.licenseReview.coversInputs = false;
      },
    ],
    [
      "license",
      (value) => {
        if (value.licenseReview) value.licenseReview.spdxId = "NOASSERTION";
      },
    ],
  ];
  for (const [reason, mutate] of mutations) {
    const value = item();
    mutate(value);
    assert.ok(bucket(snapshot([value])).candidates[0]?.reasons.includes(reason), reason);
  }
  const boundary = item();
  if (boundary.commit) boundary.commit.commit.committer.date = "2024-11-05T00:00:00Z";
  boundary.repository.size = 50000;
  assert.equal(bucket(snapshot([boundary])).eligible, 1);
});

test("round-robins input and size strata, records duplicates, and assigns one primary bucket", () => {
  const medium = item(2);
  medium.repository.size = 5001;
  const input = snapshot([item(3), medium, item(1), item(1)]);
  const firstSource = input.sources[0];
  assert.ok(firstSource);
  input.sources.push({ ...firstSource, ecosystem: "node-actions", items: [item(1, ".github/workflows/ci.yml")] });
  const report = findCandidates(input);
  const node = report.buckets.find((entry) => entry.ecosystem === "node");
  assert.deepEqual(
    node?.candidates.map((entry) => entry.repositoryId),
    [1, 2, 3],
  );
  assert.equal(node?.duplicates.length, 1);
  assert.equal(report.buckets.find((entry) => entry.ecosystem === "node-actions")?.eligible, 0);
  assert.ok(node?.strata.some((entry) => entry.available === 0));
});

test("validates untrusted snapshots and matches input paths without evaluating them", () => {
  assert.equal(matchesForm("nested/package.json", "package.json"), true);
  assert.equal(matchesForm(".github/workflows/ci.yml", ".github/workflows/*.yml"), true);
  assert.equal(matchesForm(".github/workflows/nested/ci.yml", ".github/workflows/*.yml"), false);
  assert.equal(matchesForm("packageXjson", "package.json"), false);
  assert.equal(queryPlan().length, 23);
  const badPin = item();
  if (badPin.commit) badPin.commit.sha = "main";
  assert.throws(() => findCandidates(snapshot([badPin])));
  assert.throws(() => findCandidates({ ...snapshot([]), discoveredAt: "2026-02-30" }));
  assert.throws(() => findCandidates(snapshot([]), 0));
  const leap = findCandidates({ ...snapshot([]), discoveredAt: "2024-02-29" });
  assert.equal(leap.activityCutoff, "2022-02-28T00:00:00.000Z");
});

test("CLI writes a frozen report, prints a plan, and rejects malformed input without replacing output", async () => {
  const { execFile } = await import("node:child_process");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), "evergreen-candidate-"));
  try {
    const input = join(root, "sources.json");
    const output = join(root, "candidates.json");
    const cli = resolve("dist/benchmarks/candidates/cli.js");
    const source = snapshot([item()]);
    await writeFile(input, JSON.stringify(source));
    const result = await run(process.execPath, [cli, input, output]);
    assert.match(result.stdout, /node: 1\/300 candidates; 1 eligible; shortfall 299/);
    const saved = await readFile(output, "utf8");
    assert.deepEqual(JSON.parse(saved), findCandidates(source));
    const plan = await run(process.execPath, [cli, "--plan"]);
    assert.deepEqual(JSON.parse(plan.stdout), queryPlan());
    await writeFile(input, "{}");
    await assert.rejects(run(process.execPath, [cli, input, output]));
    assert.equal(await readFile(output, "utf8"), saved);
    await assert.rejects(run(process.execPath, [cli]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
