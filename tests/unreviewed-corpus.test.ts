import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  expectedFromFindings,
  generateExpectedFindings,
  selectEligibleCandidates,
} from "../benchmarks/candidates/expected.js";
import { loadPublicCorpus } from "../benchmarks/public-corpus.js";
import {
  countCorpus,
  countUnreviewed,
  formatCorpusCounts,
  loadUnreviewedCorpus,
  UNREVIEWED_SCHEMA_VERSION,
  writeUnreviewedCorpus,
} from "../benchmarks/unreviewed-corpus.js";
import type { UnreviewedRepositoryEntry } from "../benchmarks/unreviewed-corpus.js";

const pin = "a".repeat(40);

function candidate(repository: string, eligible = true, commit: string | null = pin) {
  return {
    repository: `https://github.com/${repository}`,
    commit,
    eligible,
  };
}

function candidates(...entries: ReturnType<typeof candidate>[]) {
  return {
    schemaVersion: "evergreen.candidates.v1",
    discoveredAt: "2026-11-05",
    buckets: [{ ecosystem: "node", candidates: entries }],
  };
}

function entry(repository: string, findings = 0): UnreviewedRepositoryEntry {
  return {
    repository,
    commit: pin,
    selection: "blind",
    ecosystem: "node",
    generatedAt: "2026-11-06",
    unreviewedExpected: Array.from({ length: findings }, (_, index) => ({
      ruleId: "npm.package.request.deprecated",
      path: "package.json",
      line: index + 1,
    })),
  };
}

test("only eligible candidates with an immutable pin are scanned", () => {
  const selection = selectEligibleCandidates(
    candidates(candidate("owner/one"), candidate("owner/two", false), candidate("owner/three", true, null)),
  );
  assert.deepEqual(selection.eligible, [{ repository: "owner/one", commit: pin, ecosystem: "node" }]);
  assert.equal(selection.ineligible, 2);
  assert.throws(() => selectEligibleCandidates({ schemaVersion: "wrong" }));
});

test("expected findings omit transitive findings, deduplicate, and sort", () => {
  assert.deepEqual(
    expectedFromFindings([
      { ruleId: "npm.b", location: { path: "b.json", line: 2 } },
      { ruleId: "npm.a", location: { path: "a.json", line: 5 } },
      { ruleId: "npm.a", location: { path: "a.json", line: 1 } },
      { ruleId: "npm.a", location: { path: "a.json", line: 1 } },
      { ruleId: "npm.transitive", location: { path: "package.json" }, dependencyPath: ["a", "b"] },
    ]),
    [
      { ruleId: "npm.a", path: "a.json", line: 1 },
      { ruleId: "npm.a", path: "a.json", line: 5 },
      { ruleId: "npm.b", path: "b.json", line: 2 },
    ],
  );
});

test("generation scans local checkouts, skips reviewed repositories, and reports failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-expected-"));
  try {
    const checkouts = join(root, "checkouts");
    await mkdir(join(checkouts, "owner--one"), { recursive: true });
    await mkdir(join(checkouts, "owner--reviewed"), { recursive: true });
    const result = await generateExpectedFindings({
      candidates: candidates(candidate("owner/one"), candidate("owner/missing"), candidate("owner/reviewed")),
      checkoutsDir: checkouts,
      generatedAt: "2026-11-06",
      reviewedRepositories: new Set(["owner/reviewed"]),
      concurrency: 1,
      scan: async (path) => {
        assert.equal(path, join(checkouts, "owner--one"));
        return { findings: [{ ruleId: "npm.rule", location: { path: "package.json", line: 3 } }] };
      },
    });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.repository, "owner/one");
    assert.deepEqual(result.entries[0]?.unreviewedExpected, [{ ruleId: "npm.rule", path: "package.json", line: 3 }]);
    assert.equal(result.skippedIneligible, 0);
    assert.equal(result.skippedReviewed, 1);
    assert.deepEqual(result.failures, [
      { repository: "owner/missing", reason: `missing checkout: ${join(checkouts, "owner--missing")}` },
    ]);

    const throwing = await generateExpectedFindings({
      candidates: candidates(candidate("owner/one")),
      checkoutsDir: checkouts,
      generatedAt: "2026-11-06",
      concurrency: 1,
      scan: async () => {
        throw new Error("scan failed");
      },
    });
    assert.deepEqual(throwing.failures, [{ repository: "owner/one", reason: "scan failed" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unreviewed batches round-trip, reject reviewed state, and replace stale JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-unreviewed-"));
  try {
    await writeFile(join(root, "README.md"), "keep me\n");
    await writeFile(join(root, "node.json"), '{"stale":true}\n');
    await writeFile(join(root, "notes.json"), '{"keep":true}\n');
    const written = await writeUnreviewedCorpus(root, [entry("owner/one", 2)]);
    assert.deepEqual(written, [join(root, "node.json")]);
    assert.equal(await readFile(join(root, "README.md"), "utf8"), "keep me\n");
    assert.equal(await readFile(join(root, "notes.json"), "utf8"), '{"keep":true}\n');

    const loaded = await loadUnreviewedCorpus(root);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.repository, "owner/one");
    assert.equal(loaded[0]?.unreviewedExpected.length, 2);
    assert.equal(loaded[0]?.generatedAt, "2026-11-06");

    const batch = JSON.parse(await readFile(join(root, "node.json"), "utf8")) as {
      reviewState: string;
      schemaVersion: string;
    };
    assert.equal(batch.reviewState, "unreviewed");
    assert.equal(batch.schemaVersion, UNREVIEWED_SCHEMA_VERSION);

    await writeFile(
      join(root, "node.json"),
      `${JSON.stringify({ ...batch, reviewState: "reviewed", schemaVersion: UNREVIEWED_SCHEMA_VERSION }, null, 2)}\n`,
    );
    await assert.rejects(loadUnreviewedCorpus(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reviewed and unreviewed counts stay separate and only reviewed is precision evidence", () => {
  const reviewed = countCorpus([
    { repository: "owner/one", expected: [{ ruleId: "npm.rule" }] },
    { repository: "owner/two", expected: [] },
  ]);
  const unreviewed = countUnreviewed([entry("owner/three", 2)]);
  assert.deepEqual(reviewed, {
    repositories: 2,
    findings: 1,
    byDetector: { npm: { findings: 1, repositories: 1 } },
  });
  assert.deepEqual(unreviewed, {
    repositories: 1,
    findings: 2,
    byDetector: { npm: { findings: 2, repositories: 1 } },
  });
  assert.deepEqual(formatCorpusCounts(reviewed, unreviewed).split("\n"), [
    "scope      repositories  findings  precision evidence",
    "reviewed              2         1  yes",
    "unreviewed            1         2  no",
  ]);
});

test("the reviewed corpus loader ignores the unreviewed directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-reviewed-"));
  try {
    const reviewedDir = join(root, "benchmarks", "public-repositories", "node");
    await mkdir(reviewedDir, { recursive: true });
    await writeFile(
      join(reviewedDir, "0001--owner--reviewed.json"),
      `${JSON.stringify({ repository: "owner/reviewed", commit: pin, ecosystem: "node", expected: [] }, null, 2)}\n`,
    );
    await mkdir(join(root, "benchmarks", "unreviewed-repositories"), { recursive: true });
    await writeFile(
      join(root, "benchmarks", "unreviewed-repositories", "node.json"),
      `${JSON.stringify(
        {
          schemaVersion: UNREVIEWED_SCHEMA_VERSION,
          reviewState: "unreviewed",
          source: "scan-output",
          generatedAt: "2026-11-06",
          ecosystem: "node",
          repositories: [{ repository: "owner/unreviewed", commit: pin, selection: "blind", unreviewedExpected: [] }],
        },
        null,
        2,
      )}\n`,
    );
    const corpus = await loadPublicCorpus(root);
    assert.deepEqual(
      corpus.repositories.map((item) => item.repository),
      ["owner/reviewed"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI generates a batch and reports the two scopes separately", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), "evergreen-expected-cli-"));
  try {
    const checkouts = join(root, "checkouts");
    await mkdir(join(checkouts, "owner--one"), { recursive: true });
    await writeFile(join(checkouts, "owner--one", "package.json"), '{"name":"one","version":"1.0.0"}\n');
    const input = join(root, "candidates.json");
    const output = join(root, "unreviewed");
    await writeFile(input, JSON.stringify(candidates(candidate("owner/one"))));
    const cli = resolve("dist/benchmarks/candidates/expected-cli.js");
    const generated = await run(process.execPath, [cli, "generate", input, checkouts, output]);
    assert.match(generated.stdout, /scope\s+repositories\s+findings\s+precision evidence/);
    assert.match(generated.stdout, /reviewed\s+\d+\s+\d+\s+yes/);
    assert.match(generated.stdout, /unreviewed\s+1\s+0\s+no/);
    const saved = JSON.parse(await readFile(join(output, "node.json"), "utf8")) as {
      reviewState: string;
      repositories: Array<{ repository: string; unreviewedExpected: unknown[] }>;
    };
    assert.equal(saved.reviewState, "unreviewed");
    assert.deepEqual(saved.repositories, [
      { repository: "owner/one", commit: pin, selection: "blind", unreviewedExpected: [] },
    ]);

    const reported = await run(process.execPath, [cli, "report", output]);
    assert.match(reported.stdout, /unreviewed\s+1\s+0\s+no/);

    const partialInput = join(root, "partial.json");
    const partialOutput = join(root, "partial");
    await writeFile(partialInput, JSON.stringify(candidates(candidate("owner/one"), candidate("owner/missing"))));
    await assert.rejects(run(process.execPath, [cli, "generate", partialInput, checkouts, partialOutput]));
    await assert.rejects(readFile(join(partialOutput, "node.json")));
    await assert.rejects(run(process.execPath, [cli, "generate", input, checkouts, "."]), /Refusing to write/);
    await assert.rejects(
      run(process.execPath, [cli, "generate", input, checkouts, "benchmarks/public-repositories"]),
      /Refusing to write/,
    );
    await assert.rejects(run(process.execPath, [cli, "generate", input, checkouts]));
    await assert.rejects(run(process.execPath, [cli]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
