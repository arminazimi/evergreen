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

test("ignores supported, local, Docker, dynamic, and unknown SHA-pinned actions", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@v5
      - uses: actions/cache@v6
      - uses: ./local-action
      - uses: docker://alpine:3.20
      - uses: owner/action@\${{ inputs.ref }}
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
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

test("a known SHA pin without a comment is classified from the bundled map", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # latest
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # main
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.deepEqual(findings.map((finding) => finding.location.line), [4]);
  assert.ok(findings.every((finding) => finding.ruleId === "github-actions.checkout.node20"));
  assert.ok(findings.every((finding) => finding.summary.includes("v4.2.2 from the bundled SHA map")));
});

test("an unknown SHA pin with no usable comment is left unclassified", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`);

  const analysis = await new GitHubActionsDetector().analyze({ root });

  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified, [{
    component: "actions/checkout",
    reference: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reason: "unknown-sha",
    location: { path: ".github/workflows/ci.yml", line: 4 },
  }]);
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

test("every bundled action rule flags the release below its supported major and accepts the supported one", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const registry = JSON.parse(await readFile(resolve("registry/github-actions.json"), "utf8")) as {
    rules: Array<{ id: string; "x-github-actions": { action: string; supportedFromMajor: number } }>;
  };
  assert.ok(registry.rules.length >= 15);
  for (const rule of registry.rules) {
    const { action, supportedFromMajor } = rule["x-github-actions"];
    const root = await repositoryWithWorkflow(
      `jobs:\n  test:\n    steps:\n      - uses: ${action}@v${supportedFromMajor - 1}\n      - uses: ${action}@v${supportedFromMajor}\n      - uses: ${action}@v${supportedFromMajor}.1.0\n`,
    );
    const findings = await new GitHubActionsDetector().scan({ root });
    assert.deepEqual(
      findings.map((finding) => [finding.ruleId, finding.location.line]),
      [[rule.id, 4]],
      `${action} below v${supportedFromMajor}`,
    );
  }
});

const setupDotnetWorkflow = (versions: string): string => `name: CI
jobs:
  build:
    steps:
      - uses: actions/checkout@v7
      - name: Setup .NET
        uses: actions/setup-dotnet@v5
        with:
${versions}
`;

test("a literal dotnet-version for actions/setup-dotnet is judged with the dotnet runtime rules", async () => {
  const root = await repositoryWithWorkflow(setupDotnetWorkflow("          dotnet-version: '6.0.x'"));
  const analysis = await new GitHubActionsDetector().analyze({ root });
  const found = analysis.findings.filter((finding) => finding.ruleId.startsWith("dotnet.runtime."));
  assert.deepEqual(found.map((finding) => [finding.ruleId, finding.location.line]), [["dotnet.runtime.end-of-support-6.0", 9]]);
  assert.match(found[0]!.summary, /installs \.NET 6\.0\.x/);
  assert.ok(found[0]!.sources.some((source) => source.url.includes("microsoft.com")));
  assert.deepEqual(analysis.unclassified, []);
});

test("a multi-line dotnet-version is judged per entry at the entry's own line", async () => {
  const root = await repositoryWithWorkflow(setupDotnetWorkflow("          dotnet-version: |\n            5.0.x\n            6.0.100\n            10.0.x"));
  const analysis = await new GitHubActionsDetector().analyze({ root });
  assert.deepEqual(
    analysis.findings.filter((finding) => finding.ruleId.startsWith("dotnet.runtime.")).map((finding) => [finding.ruleId, finding.location.line]),
    [["dotnet.runtime.end-of-support-5.0", 10], ["dotnet.runtime.end-of-support-6.0", 11]],
  );
});

test("an expression, a floating major, or a pre-release dotnet-version is unclassified, never guessed", async () => {
  const root = await repositoryWithWorkflow(setupDotnetWorkflow("          dotnet-version: |\n            ${{ matrix.dotnet }}\n            6.x\n            7.0.100-preview.1"));
  const analysis = await new GitHubActionsDetector().analyze({ root });
  assert.deepEqual(analysis.findings.filter((finding) => finding.ruleId.startsWith("dotnet.runtime.")), []);
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.location.line, item.reference]),
    [[10, "dotnet-version: ${{ matrix.dotnet }}"], [11, "dotnet-version: 6.x"], [12, "dotnet-version: 7.0.100-preview.1"]],
  );
});

test("dotnet-version is read only for actions/setup-dotnet, and malformed workflows are skipped", async () => {
  const other = await repositoryWithWorkflow(`jobs:
  build:
    steps:
      - uses: example/setup-dotnet-clone@v1
        with:
          dotnet-version: 5.0.x
      - run: echo
        with:
          dotnet-version: 5.0.x
`);
  assert.deepEqual((await new GitHubActionsDetector().analyze({ root: other })).findings, []);
  const malformed = await repositoryWithWorkflow("jobs: [\n  - uses: actions/setup-dotnet@v5\n    with: {dotnet-version: 5.0.x\n");
  assert.deepEqual(await new GitHubActionsDetector().scan({ root: malformed }), []);
  const supported = await repositoryWithWorkflow(setupDotnetWorkflow("          dotnet-version: 10.0.x"));
  assert.deepEqual((await new GitHubActionsDetector().analyze({ root: supported })).findings, []);
});
