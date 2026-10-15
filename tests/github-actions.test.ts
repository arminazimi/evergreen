import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { GitHubActionsDetector } from "../src/detectors/github-actions.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repositoryWithWorkflow(contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-actions-"));
  temporaryRoots.push(root);
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  await writeFile(join(workflows, "ci.yml"), contents);
  return root;
}

test("finds unsupported action majors with exact line locations", async () => {
  const root = await repositoryWithWorkflow(`name: CI
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: "actions/setup-node@v4" # old runtime
      - uses: actions/cache@v4.2.0
      - uses: actions/upload-artifact@v6
      - uses: actions/download-artifact@v3
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 5);
  assert.deepEqual(
    findings.map((finding) => finding.location.line),
    [5, 6, 7, 8, 9],
  );
  assert.equal(findings[0]?.location.path, ".github/workflows/ci.yml");
  assert.equal(findings[4]?.severity, "critical");
});

test("ignores supported, local, Docker, dynamic, and SHA-pinned actions", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@v5
      - uses: actions/cache@v6
      - uses: ./local-action
      - uses: docker://alpine:3.20
      - uses: owner/action@\${{ inputs.ref }}
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("returns no findings when the workflows directory is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-actions-empty-"));
  temporaryRoots.push(root);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});

// Issue #113: a SHA-pinned action with a trailing version comment is classified from the comment.
test("classifies a SHA-pinned checkout from its trailing version comment", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v3.6.0
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "github-actions.checkout.node20");
  assert.equal(findings[0]?.location.line, 4);
  assert.equal(findings[0]?.location.path, ".github/workflows/ci.yml");
  assert.match(findings[0]?.summary ?? "", /^actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 \(v3.6.0 from the trailing comment\): /);
});

test("accepts every supported comment form", async () => {
  // Deprecated majors (v4) must produce a finding; supported majors (v5) must not.
  const deprecated = ["# v4", "# v4.1", "# v4.1.1", "#v4.1.1", "# 4.1.1", "# v4.1.1 (pinned for security)", "# tag=v4.1.1", "# version: v4.1.1"];
  const supported = ["# v5", "# v5.1", "# v5.1.1", "#v5.1.1", "# 5.1.1", "# v5.1.1 (pinned for security)", "# tag=v5.1.1", "# version: v5.1.1"];

  for (const [index, comment] of deprecated.entries()) {
    const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 ${comment}
`);
    const findings = await new GitHubActionsDetector().scan({ root });
    assert.equal(findings.length, 1, `comment "${comment}" must be parsed as a deprecated version`);
    assert.equal(findings[0]?.location.line, 4, `comment "${comment}" must land on line 4`);
  }

  for (const [index, comment] of supported.entries()) {
    const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 ${comment}
`);
    const findings = await new GitHubActionsDetector().scan({ root });
    assert.deepEqual(findings, [], `comment "${comment}" must classify as a supported version`);
  }
});

test("a supported SHA pin with a version comment produces no finding", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v5
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("a SHA pin with no usable comment is left unclassified", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # latest
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # main
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("rejects malformed and conflicting comment versions", async () => {
  const cases = [
    "# v4..1",
    "# v4.1.1.1",
    "# v3 -> v4",
    "# v3.6.0 # v4",
  ];

  for (const comment of cases) {
    const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 ${comment}
`);
    const findings = await new GitHubActionsDetector().scan({ root });
    assert.deepEqual(findings, [], `comment "${comment}" must not be classified`);
  }
});

test("a comment on a tag ref is ignored; the ref decides", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@v3 # v5
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "github-actions.checkout.node20");
  assert.equal(findings[0]?.location.line, 4);
  assert.match(findings[0]?.summary ?? "", /^actions\/checkout@v3: /);
});

test("CRLF line endings are handled", async () => {
  const root = await repositoryWithWorkflow(
    `jobs:\r\n  test:\r\n    steps:\r\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v3.6.0\r\n`,
  );

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.location.line, 4);
});

test("quoted uses entries are parsed", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683" # v3.6.0
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.location.line, 4);
});

test("list-item uses entries are parsed", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v3.6.0
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.location.line, 4);
});

test("two pinned refs in one file get their own lines", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v3.6.0
      - uses: actions/setup-node@11bd71901bbe5b1630ceea73d27597364c9af683 # v3
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.line]),
    [
      ["github-actions.checkout.node20", 4],
      ["github-actions.setup-node.node20", 5],
    ],
  );
});
