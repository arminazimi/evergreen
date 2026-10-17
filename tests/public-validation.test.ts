import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

async function corpusAndValidator() {
  const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8"));
  const schema = JSON.parse(await readFile(resolve("schemas/public-validation.v1.schema.json"), "utf8"));
  return { corpus, validate: new Ajv2020({ allErrors: true }).compile(schema) };
}

test("the public validation corpus matches its versioned JSON Schema", async () => {
  const { corpus, validate } = await corpusAndValidator();
  assert.ok(validate(corpus), JSON.stringify(validate.errors));
});

test("the corpus schema rejects malformed commits and findings", async (t) => {
  const { corpus, validate } = await corpusAndValidator();
  for (const [name, mutate] of [
    ["short commit", (value: typeof corpus) => { value.repositories[0].commit = "abcdef"; }],
    ["non-hex commit", (value: typeof corpus) => { value.repositories[0].commit = "g".repeat(40); }],
    ["missing rule ID", (value: typeof corpus) => { delete value.repositories[0].expected[0].ruleId; }],
    ["empty rule ID", (value: typeof corpus) => { value.repositories[0].expected[0].ruleId = ""; }],
    ["zero line", (value: typeof corpus) => { value.repositories[0].expected[0].line = 0; }],
    ["fractional line", (value: typeof corpus) => { value.repositories[0].expected[0].line = 1.5; }],
    ["unknown ecosystem", (value: typeof corpus) => { value.repositories[0].ecosystem = "unknown"; }],
    ["invalid repository", (value: typeof corpus) => { value.repositories[0].repository = "express"; }],
    ["too few repositories", (value: typeof corpus) => { value.repositories.length = 19; }],
  ] as const) {
    await t.test(name, () => {
      const invalid = structuredClone(corpus);
      mutate(invalid);
      assert.equal(validate(invalid), false);
      assert.ok(validate.errors?.length);
    });
  }
});

test("repository uniqueness remains a semantic check", async () => {
  const { corpus, validate } = await corpusAndValidator();
  corpus.repositories[1].repository = corpus.repositories[0].repository;
  assert.equal(validate(corpus), true);
  assert.equal(
    new Set(corpus.repositories.map((item: { repository: string }) => item.repository)).size,
    corpus.repositories.length - 1,
  );
});

test("the public validation corpus is pinned, balanced, and audited", async () => {
  const corpus = JSON.parse(
    await readFile(resolve("benchmarks/public-repositories.json"), "utf8"),
  ) as {
    schemaVersion: string;
    repositories: Array<{
      repository: string;
      commit: string;
      ecosystem: string;
      expected: Array<{ ruleId: string; path: string; line?: number }>;
    }>;
  };

  assert.equal(corpus.schemaVersion, "evergreen.public-validation.v1");
  assert.ok(corpus.repositories.length >= 20);
  assert.equal(new Set(corpus.repositories.map((item) => item.repository)).size, corpus.repositories.length);
  assert.ok(corpus.repositories.every((item) => /^[a-f0-9]{40}$/.test(item.commit)));
  // The first twenty entries are the audited v0.1 corpus (27 findings when it was audited). Findings from
  // rules added later (for example the setup-python rule) appear in them too, so the total only grows.
  const original = corpus.repositories.slice(0, 20);
  assert.equal(original.filter((item) => item.ecosystem.startsWith("node")).length, 10);
  assert.ok(original.reduce((total, item) => total + item.expected.length, 0) >= 27);
});

test("every mined corpus entry cites a reviewed migration or a recorded maintainer review", async () => {
  const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as {
    repositories: Array<{
      repository: string;
      commit: string;
      ecosystem: string;
      expected: Array<{ ruleId: string; path: string; groundTruthSource: { kind: string; url?: string; note?: string } }>;
    }>;
  };
  const log = JSON.parse(await readFile(resolve("benchmarks/mining/review-log.json"), "utf8")) as {
    entries: Array<{ repository: string; parentCommit: string; migrationCommit: string; decision: string }>;
  };
  const accepted = log.entries.filter((entry) => entry.decision === "accepted");
  // Entries 21-30 are the GitHub Actions additions; the rest come from the larger independent corpus.
  const mined = corpus.repositories.slice(20);
  assert.ok(mined.length >= 30);
  let withReview = 0;
  for (const entry of mined) {
    const reviewed = accepted.filter((candidate) => candidate.repository === entry.repository);
    if (reviewed.length === 0) {
      for (const finding of entry.expected) {
        assert.equal(finding.groundTruthSource.kind, "maintainer-review", `${entry.repository} is not in the review log, so its findings need a maintainer review`);
        assert.ok(finding.groundTruthSource.note?.includes(finding.path), `${entry.repository} ${finding.ruleId} must record the reviewed line`);
      }
      continue;
    }
    withReview++;
    for (const finding of entry.expected) {
      const source = finding.groundTruthSource;
      if (source.kind === "migration-commit") {
        assert.ok(
          reviewed.some(
            (candidate) =>
              (candidate.parentCommit === entry.commit || candidate.migrationCommit === entry.commit) &&
              source.url === `https://github.com/${entry.repository}/commit/${candidate.migrationCommit}`,
          ),
          `${entry.repository} ${finding.ruleId} is not backed by an accepted migration`,
        );
      } else {
        assert.equal(source.kind, "maintainer-review", `${entry.repository} ${finding.ruleId}`);
        assert.ok(source.note?.includes(finding.path), `${entry.repository} ${finding.ruleId} must record the reviewed line`);
      }
    }
    if (entry.expected.length === 0) {
      assert.ok(reviewed.some((candidate) => candidate.migrationCommit === entry.commit), `${entry.repository} zero-finding entry must pin a reviewed migration commit`);
    }
  }
  assert.ok(withReview >= 26);
});

test("the corpus covers every shipped ecosystem with positive and zero-finding repositories", async () => {
  const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as {
    repositories: Array<{ ecosystem: string; expected: Array<{ ruleId: string }> }>;
  };
  assert.ok(corpus.repositories.length >= 50);
  const ruleFamilies = new Set(corpus.repositories.flatMap((entry) => entry.expected.map((finding) => finding.ruleId.split(".")[0])));
  for (const family of ["container", "github-actions", "go", "nodejs", "npm", "python", "rust"]) assert.ok(ruleFamilies.has(family), `no expected finding for ${family}`);
  for (const ecosystem of ["node", "python", "node-actions", "container", "go", "rust"]) {
    const entries = corpus.repositories.filter((entry) => entry.ecosystem === ecosystem);
    assert.ok(entries.some((entry) => entry.expected.length > 0), `${ecosystem} has no positive repository`);
    assert.ok(entries.some((entry) => entry.expected.length === 0), `${ecosystem} has no zero-finding repository`);
  }
});
