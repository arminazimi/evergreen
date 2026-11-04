import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import type { LookupFinding } from "../src/lookup.js";
import { checkUpgrade } from "../src/upgrade/index.js";
import {
  SOON_ENDING_DAYS,
  analyzeTargetLifecycle,
  imagePin,
  pinDiffersFromTarget,
  pinIssues,
  readRuntimePins,
  targetLifecycleAnalyzer,
  targetLifecycleIssue,
  targetPrecision,
  toolVersionPins,
  workflowPins,
} from "../src/upgrade/target-lifecycle.js";
import type { RuntimePin } from "../src/upgrade/target-lifecycle.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

let fixtures: string;
const temporaryRoots: string[] = [];

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/upgrade/target-lifecycle"), temporaryRoots);
});

/** A fixed day inside the 2026-11-10 dotnet horizon and after every already-past deadline used below. */
const day = "2026-11-04";

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

async function temporaryRoot(prefix: string, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  await writeFiles(root, files);
  return root;
}

function nodePin(value: string, normalized: string): RuntimePin {
  return { runtime: "nodejs", path: ".nvmrc", line: 1, value, normalized, field: "nvmrc" };
}

function finding(
  ruleId: string,
  event: LookupFinding["event"],
  extra?: { deadline?: string; replacement?: string },
): LookupFinding {
  return {
    ruleId,
    ecosystem: "generic",
    event,
    severity: "high",
    title: `Title of ${ruleId}`,
    summary: `Summary of ${ruleId}`,
    affectedVersions: "*",
    sources: [],
    ...(extra?.deadline === undefined ? {} : { deadline: extra.deadline }),
    ...(extra?.replacement === undefined ? {} : { replacement: extra.replacement }),
  };
}

test("counts the leading numeric components of a target version", () => {
  assert.equal(targetPrecision("22"), 1);
  assert.equal(targetPrecision("3.13"), 2);
  assert.equal(targetPrecision("8.4.0"), 3);
  assert.equal(targetPrecision("latest"), 0);
});

test("a pin matches the target at the precision the target was written with", () => {
  assert.equal(pinDiffersFromTarget(nodePin("20", "20.0.0"), { runtime: "nodejs", version: "20" }), false);
  assert.equal(pinDiffersFromTarget(nodePin("20.11.4", "20.11.4"), { runtime: "nodejs", version: "20" }), false);
  assert.equal(pinDiffersFromTarget(nodePin("20.11.4", "20.11.4"), { runtime: "nodejs", version: "20.11" }), false);
  assert.equal(pinDiffersFromTarget(nodePin("20.11.4", "20.11.4"), { runtime: "nodejs", version: "20.12" }), true);
  assert.equal(pinDiffersFromTarget(nodePin("20", "20.0.0"), { runtime: "nodejs", version: "21" }), true);
  assert.equal(pinDiffersFromTarget(nodePin("20", "20.0.0"), { runtime: "nodejs", version: "latest" }), true);
});

test("simple pin files yield their first version line, never a moving name", async () => {
  const root = await temporaryRoot("evergreen-target-lifecycle-", {
    ".nvmrc": "# managed by hand\n\nlts/*\n",
    ".python-version": "  \n# comment first\n3.12\n9.9\n",
  });
  const pins = await readRuntimePins(root);
  assert.deepEqual(pins, [
    {
      runtime: "python",
      path: ".python-version",
      line: 3,
      value: "3.12",
      normalized: "3.12.0",
      field: "python-version",
    },
  ]);
});

test("a .tool-versions line yields its first concrete version only", () => {
  const pins = toolVersionPins(
    [
      "# asdf tools",
      "   ",
      "NODE 22.11.0 18.19.0",
      "python path:/opt/python",
      "dart ref:https://github.com/dart-lang/sdk",
      "erlang 26.0",
      "golang 1.24.0 # newest",
      "ruby",
    ].join("\n"),
  );
  assert.deepEqual(pins, [
    {
      runtime: "nodejs",
      path: ".tool-versions",
      line: 3,
      value: "22.11.0",
      normalized: "22.11.0",
      field: ".tool-versions NODE",
    },
    {
      runtime: "go",
      path: ".tool-versions",
      line: 7,
      value: "1.24.0",
      normalized: "1.24.0",
      field: ".tool-versions golang",
    },
  ]);
});

test("an image reference pins only a supported runtime repository with a version tag", () => {
  assert.deepEqual(imagePin("node:18-alpine", 1, "Dockerfile"), {
    runtime: "nodejs",
    path: "Dockerfile",
    line: 1,
    value: "node:18-alpine",
    normalized: "18.0.0",
    field: "FROM",
  });
  assert.deepEqual(imagePin("mcr.microsoft.com/dotnet/sdk:9.0", 3, "app/Dockerfile"), {
    runtime: "dotnet",
    path: "app/Dockerfile",
    line: 3,
    value: "mcr.microsoft.com/dotnet/sdk:9.0",
    normalized: "9.0.0",
    field: "FROM",
  });
  assert.equal(imagePin("nginx:1.27", 1, "Dockerfile"), undefined);
  assert.equal(imagePin("node:lts", 1, "Dockerfile"), undefined);
  assert.equal(imagePin("node", 1, "Dockerfile"), undefined);
  assert.equal(imagePin("internal.example.com/team/node:20", 1, "Dockerfile"), undefined);
});

test("workflows yield pins for recognized setup actions, scalars and lists alike", () => {
  const pins = workflowPins(
    ".github/workflows/ci.yml",
    [
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: [20.11, '22', '${{ matrix.version }}']",
      "      - uses: actions/setup-java@v4",
      "        with:",
      "          java-version: '17'",
      "      - uses: actions/setup-erlang@v5",
      "        with:",
      "          erlang-version: '26'",
      "      - uses: actions/setup-go@v5",
    ].join("\n"),
  );
  assert.deepEqual(pins, [
    {
      runtime: "nodejs",
      path: ".github/workflows/ci.yml",
      line: 6,
      value: "20.11",
      normalized: "20.11.0",
      field: "actions/setup-node",
    },
    {
      runtime: "nodejs",
      path: ".github/workflows/ci.yml",
      line: 6,
      value: "22",
      normalized: "22.0.0",
      field: "actions/setup-node",
    },
    {
      runtime: "java",
      path: ".github/workflows/ci.yml",
      line: 9,
      value: "17",
      normalized: "17.0.0",
      field: "actions/setup-java",
    },
  ]);
});

test("workflow text that is not a readable jobs map yields no pins", () => {
  assert.deepEqual(workflowPins("w.yml", "jobs:\n  broken: [unclosed\n"), []);
  assert.deepEqual(workflowPins("w.yml", "just a string\n"), []);
  assert.deepEqual(workflowPins("w.yml", "name: no jobs\n"), []);
  assert.deepEqual(workflowPins("w.yml", "jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n"), []);
  assert.deepEqual(
    workflowPins(
      "w.yml",
      "jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version:\n",
    ),
    [],
  );
});

test("an end-of-life or out-of-support target is a blocker with the bundled suggestion", () => {
  const issue = targetLifecycleIssue(
    { runtime: "nodejs", version: "18" },
    [
      finding("nodejs.runtime.eol-18", "end-of-life", {
        deadline: "2025-04-30",
        replacement: "Node.js 22 LTS or later",
      }),
    ],
    day,
  );
  assert.deepEqual(issue, {
    analyzer: "target-lifecycle",
    level: "blocker",
    subject: "nodejs@18",
    path: "",
    reason: "The target itself is end-of-life; choose Node.js 22 LTS or later.",
    evidence: { kind: "rule", value: "nodejs.runtime.eol-18" },
  });
  const outOfSupport = targetLifecycleIssue(
    { runtime: "java", version: "19" },
    [finding("java.jdk.end-of-support-18-20", "end-of-support", { replacement: "Java 25 (LTS) or later" })],
    day,
  );
  assert.equal(outOfSupport?.level, "blocker");
  assert.match(String(outOfSupport?.reason), /out of support; choose Java 25 \(LTS\) or later\./);
  const bare = targetLifecycleIssue(
    { runtime: "go", version: "1.21" },
    [finding("go.runtime.end-of-support-1.21", "end-of-support")],
    day,
  );
  assert.match(String(bare?.reason), /choose a newer supported line named by the bundled lifecycle data\./);
});

test("a scheduled end inside the horizon is a warning, outside it is nothing", () => {
  const soon = [
    finding("dotnet.runtime.end-of-support-8.0", "scheduled-end-of-life", {
      deadline: "2026-11-10",
      replacement: ".NET 10 (LTS), or the newest supported .NET release",
    }),
  ];
  const warning = targetLifecycleIssue({ runtime: "dotnet", version: "8.0" }, soon, day);
  assert.deepEqual(warning, {
    analyzer: "target-lifecycle",
    level: "warning",
    subject: "dotnet@8.0",
    path: "",
    reason: `The target itself ends on 2026-11-10, within ${SOON_ENDING_DAYS} days; choose .NET 10 (LTS), or the newest supported .NET release.`,
    evidence: { kind: "rule", value: "dotnet.runtime.end-of-support-8.0" },
  });
  assert.equal(targetLifecycleIssue({ runtime: "dotnet", version: "8.0" }, soon, "2025-01-01"), undefined);
  assert.equal(
    targetLifecycleIssue(
      { runtime: "dotnet", version: "8.0" },
      [finding("dotnet.runtime.end-of-support-8.0", "scheduled-end-of-life")],
      day,
    ),
    undefined,
  );
  const passed = targetLifecycleIssue({ runtime: "dotnet", version: "8.0" }, soon, "2026-12-01");
  assert.equal(passed?.level, "blocker");
});

test("only the runtime's own rules judge the target, never module or platform rules", () => {
  assert.equal(
    targetLifecycleIssue(
      { runtime: "python", version: "3.12" },
      [
        finding("python.module.distutils.removed", "removed"),
        finding("serverless.azure-app-service.php-8-1", "end-of-life", { deadline: "2025-12-31" }),
      ],
      day,
    ),
    undefined,
  );
  assert.equal(targetLifecycleIssue({ runtime: "nodejs", version: "24" }, [], day), undefined);
  assert.equal(
    targetLifecycleIssue(
      { runtime: "elixir", version: "1.14" },
      [finding("elixir.runtime.eol-1.14", "end-of-life")],
      day,
    ),
    undefined,
  );
});

test("pins of the target runtime that differ are listed, others are not", () => {
  const pins: RuntimePin[] = [
    nodePin("20", "20.0.0"),
    {
      runtime: "python",
      path: ".python-version",
      line: 1,
      value: "3.11",
      normalized: "3.11.0",
      field: "python-version",
    },
    { runtime: "nodejs", path: "Dockerfile", line: 2, value: "node:24.0.0", normalized: "24.0.0", field: "FROM" },
  ];
  const issues = pinIssues(pins, { runtime: "nodejs", version: "24" });
  assert.deepEqual(issues, [
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".nvmrc",
      line: 1,
      reason: ".nvmrc still pins Node.js 20; update it to the target 24.",
      evidence: { kind: "manifest", value: "nvmrc: 20" },
    },
  ]);
  const other = pinIssues([nodePin("20", "20.0.0")], { runtime: "elixir", version: "1.16" });
  assert.equal(other.length, 0);
});

test("reads every supported pin file, recursing into bounded directories", async () => {
  const root = await temporaryRoot("evergreen-target-lifecycle-", {
    "deploy/Dockerfile.api": "FROM ruby:3.2.2\n",
    Containerfile: "FROM golang:1.24-debian\n",
    "dist/Dockerfile": "FROM node:14\n",
    "node_modules/dep/Dockerfile": "FROM node:12\n",
  });
  const pins = await readRuntimePins(root);
  assert.deepEqual(
    pins.map((pin) => `${pin.path}:${pin.line}:${pin.runtime}`),
    ["Containerfile:1:go", "deploy/Dockerfile.api:1:ruby"],
  );
});

test("the node-pins fixture lists every differing pin against nodejs@24", async () => {
  const issues = await analyzeTargetLifecycle(join(fixtures, "node-pins"), { runtime: "nodejs", version: "24" }, day);
  assert.deepEqual(issues, [
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".node-version",
      line: 1,
      reason: ".node-version still pins Node.js 18.19.0; update it to the target 24.",
      evidence: { kind: "manifest", value: "node-version: 18.19.0" },
    },
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".nvmrc",
      line: 1,
      reason: ".nvmrc still pins Node.js 20; update it to the target 24.",
      evidence: { kind: "manifest", value: "nvmrc: 20" },
    },
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".tool-versions",
      line: 1,
      reason: ".tool-versions still pins Node.js 18.19.0; update it to the target 24.",
      evidence: { kind: "manifest", value: ".tool-versions node: 18.19.0" },
    },
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: "Dockerfile",
      line: 2,
      reason: "Dockerfile still pins Node.js node:20.11.1-slim; update it to the target 24.",
      evidence: { kind: "manifest", value: "FROM: node:20.11.1-slim" },
    },
  ]);
});

test("an end-of-life target blocks at the first pin, and pins on the target are not listed", async () => {
  const issues = await analyzeTargetLifecycle(
    join(fixtures, "multi-runtime"),
    { runtime: "ruby", version: "3.1" },
    day,
  );
  assert.deepEqual(issues, [
    {
      analyzer: "target-lifecycle",
      level: "blocker",
      subject: "ruby@3.1",
      path: ".ruby-version",
      line: 1,
      reason: "The target itself is end-of-life; choose Ruby 3.4 or later.",
      evidence: { kind: "rule", value: "ruby.runtime.eol-3.1" },
    },
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".ruby-version",
      line: 1,
      reason: ".ruby-version still pins Ruby 3.2.2; update it to the target 3.1.",
      evidence: { kind: "manifest", value: "ruby-version: 3.2.2" },
    },
  ]);
  assert.deepEqual(
    await analyzeTargetLifecycle(join(fixtures, "eol-target"), { runtime: "nodejs", version: "18" }, day),
    [
      {
        analyzer: "target-lifecycle",
        level: "blocker",
        subject: "nodejs@18",
        path: ".nvmrc",
        line: 1,
        reason: "The target itself is end-of-life; choose Node.js 22 LTS or later.",
        evidence: { kind: "rule", value: "nodejs.runtime.eol-18" },
      },
    ],
  );
});

test("a soon-ending target warns on the day, blocks once past, and says nothing while far off", async () => {
  const root = join(fixtures, "soon-ending");
  const target = { runtime: "dotnet", version: "8.0" };
  assert.deepEqual(await analyzeTargetLifecycle(root, target, day), [
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "dotnet@8.0",
      path: ".github/workflows/dotnet.yml",
      line: 9,
      reason:
        "The target itself ends on 2026-11-10, within 180 days; choose .NET 10 (LTS), or the newest supported .NET release.",
      evidence: { kind: "rule", value: "dotnet.runtime.end-of-support-8.0" },
    },
  ]);
  assert.deepEqual(await analyzeTargetLifecycle(root, target, "2025-01-01"), []);
  const past = await analyzeTargetLifecycle(root, target, "2026-12-01");
  assert.equal(past[0]?.level, "blocker");
});

test("a supported target lists only the pins that move, and module rules never block", async () => {
  const moving = await analyzeTargetLifecycle(
    join(fixtures, "soon-ending"),
    { runtime: "dotnet", version: "10.0" },
    day,
  );
  assert.deepEqual(
    moving.map((issue) => `${issue.path}:${issue.line}`),
    [".github/workflows/dotnet.yml:9", "global.json:3"],
  );
  assert.ok(moving.every((issue) => issue.subject === "pin to update" && issue.level === "warning"));

  const python = await analyzeTargetLifecycle(join(fixtures, "node-pins"), { runtime: "python", version: "3.12" }, day);
  assert.deepEqual(python, [
    {
      analyzer: "target-lifecycle",
      level: "warning",
      subject: "pin to update",
      path: ".python-version",
      line: 1,
      reason: ".python-version still pins Python 3.11; update it to the target 3.12.",
      evidence: { kind: "manifest", value: "python-version: 3.11" },
    },
  ]);
  assert.deepEqual(
    await analyzeTargetLifecycle(join(fixtures, "matching-pins"), { runtime: "nodejs", version: "24.12" }, day),
    [],
  );
});

test("end-of-support targets block with the bundled suggestion for java and dart", async () => {
  const java = await analyzeTargetLifecycle(join(fixtures, "multi-runtime"), { runtime: "java", version: "19" }, day);
  assert.deepEqual(
    java.map((issue) => `${issue.level} ${issue.path}:${issue.line}`),
    ["blocker .java-version:1", "warning .java-version:1", "warning .tool-versions:2"],
  );
  assert.deepEqual(
    await analyzeTargetLifecycle(join(fixtures, "multi-runtime"), { runtime: "dart", version: "3.8" }, day),
    [
      {
        analyzer: "target-lifecycle",
        level: "blocker",
        subject: "dart@3.8",
        path: ".tool-versions",
        line: 1,
        reason: "The target itself is out of support; choose Dart 3.13 or later.",
        evidence: { kind: "rule", value: "dart.sdk.end-of-support-3.8" },
      },
    ],
  );
});

test("a runtime the repository does not pin, and a repository without pins, do not apply", async () => {
  assert.deepEqual(
    await analyzeTargetLifecycle(join(fixtures, "node-pins"), { runtime: "ruby", version: "3.4" }, day),
    [],
  );
  assert.deepEqual(
    await analyzeTargetLifecycle(join(fixtures, "node-pins"), { runtime: "elixir", version: "1.16" }, day),
    [],
  );
  assert.equal(await targetLifecycleAnalyzer.applies(join(fixtures, "no-pins")), false);
  assert.deepEqual(
    await targetLifecycleAnalyzer.analyze(join(fixtures, "no-pins"), { runtime: "nodejs", version: "18" }),
    [],
  );
  const report = await checkUpgrade(join(fixtures, "no-pins"), { runtime: "nodejs", version: "18" });
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
});

test("checkUpgrade runs the analyzer alone against a pin-only repository", async () => {
  const report = await checkUpgrade(join(fixtures, "eol-target"), { runtime: "nodejs", version: "18" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["target-lifecycle"]);
  assert.deepEqual(report.issues, [
    {
      analyzer: "target-lifecycle",
      level: "blocker",
      subject: "nodejs@18",
      path: ".nvmrc",
      line: 1,
      reason: "The target itself is end-of-life; choose Node.js 22 LTS or later.",
      evidence: { kind: "rule", value: "nodejs.runtime.eol-18" },
    },
  ]);
  const ready = await checkUpgrade(join(fixtures, "node-pins"), { runtime: "nodejs", version: "24" });
  assert.equal(ready.verdict, "ready");
  assert.equal(ready.issues.length, 4);
});

test("the analyzer judges the target on the real clock, reading bundled data only", async () => {
  const issues = await targetLifecycleAnalyzer.analyze(join(fixtures, "eol-target"), {
    runtime: "nodejs",
    version: "18",
  });
  assert.deepEqual(issues, [
    {
      analyzer: "target-lifecycle",
      level: "blocker",
      subject: "nodejs@18",
      path: ".nvmrc",
      line: 1,
      reason: "The target itself is end-of-life; choose Node.js 22 LTS or later.",
      evidence: { kind: "rule", value: "nodejs.runtime.eol-18" },
    },
  ]);
});

test("the CLI exits 1 on the blocker and prints the rule evidence", async () => {
  const blocked = await runCli(["upgrade-check", "--to", "nodejs@18", join(fixtures, "eol-target")]);
  assert.equal(blocked.code, 1);
  assert.match(blocked.stdout, /^nodejs@18: blocked/);
  assert.match(
    blocked.stdout,
    /\.nvmrc:1 {2}nodejs@18 {2}The target itself is end-of-life; choose Node\.js 22 LTS or later\. {2}\[rule: nodejs\.runtime\.eol-18\]/,
  );

  const unknown = await runCli(["upgrade-check", "--to", "nodejs@18", join(fixtures, "no-pins")]);
  assert.equal(unknown.code, 0);
  assert.match(unknown.stdout, /^nodejs@18: unknown/);
});

test("the blocked report is valid evergreen.upgrade.v1 JSON", async () => {
  const result = await runCli(["upgrade-check", "--to", "nodejs@18", join(fixtures, "eol-target"), "--json"]);
  assert.equal(result.code, 1);
  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const report = JSON.parse(result.stdout) as { verdict: string; issues: unknown[]; analyzers: string[] };
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["target-lifecycle"]);
  assert.equal(report.issues.length, 1);
});
