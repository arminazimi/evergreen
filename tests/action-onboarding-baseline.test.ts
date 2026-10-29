import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { applyBaseline, createBaseline, readBaseline, writeBaseline } from "../src/baseline.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A fixture with one high finding, so a baseline has something to record and the gate can fail. */
async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-onboarding-baseline-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  return root;
}

interface CommentApi {
  url: string;
  /** The `body` of every POST to the comments endpoint. */
  bodies: string[];
  close(): Promise<void>;
}

/** A local GitHub API that records posted comments and has none to update. */
async function commentApi(): Promise<CommentApi> {
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { raw += chunk; });
    request.on("end", () => {
      bodies.push((JSON.parse(raw) as { body: string }).body);
      response.writeHead(201, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    bodies,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

async function pullRequestEvent(root: string, headRepository = "acme/app"): Promise<string> {
  const path = join(root, "event.json");
  await writeFile(path, JSON.stringify({
    pull_request: { number: 7, head: { ref: "evergreen/onboarding", repo: { full_name: headRepository } } },
  }));
  return path;
}

async function runAction(root: string, inputs: Record<string, string>): Promise<{ code: number; stdout: string; outputs: string; summary: string }> {
  const runner = join(root, ".runner");
  const output = join(runner, "outputs.txt");
  const summary = join(runner, "summary.md");
  await mkdir(runner, { recursive: true });
  await Promise.all([writeFile(output, ""), writeFile(summary, "")]);

  const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      INPUT_ATTRIBUTION: "false",
      ...inputs,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  const code = await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolveCode(status ?? 1));
  });
  return { code, stdout, outputs: await readFile(output, "utf8"), summary: await readFile(summary, "utf8") };
}

/** The JSON inside the one fenced block of a comment, or `undefined` when the comment has none. */
function fencedJson(body: string): string | undefined {
  return /```json\n([\s\S]*?)\n```/.exec(body)?.[1];
}

test("the first onboarding run proposes a valid baseline instead of failing the severity gate", async () => {
  const root = await fixtureRepository();
  const api = await commentApi();
  try {
    const run = await runAction(root, {
      GITHUB_HEAD_REF: "evergreen/onboarding",
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_EVENT_PATH: await pullRequestEvent(root),
      GITHUB_API_URL: api.url,
      INPUT_BASELINE: ".evergreen-baseline.json",
      "INPUT_GITHUB-TOKEN": "test-token",
      "INPUT_FAIL-ON-SEVERITY": "high",
    });

    assert.equal(run.code, 0, "an onboarding first run starts green");
    assert.match(run.stdout, /Evergreen proposed a baseline/);
    assert.match(run.stdout, /proposed a baseline of 1 finding for \.evergreen-baseline\.json/);
    assert.equal(run.stdout.includes("policy gate failed"), false);
    assert.match(run.summary, /\*\*Suggested baseline:\*\* `\.evergreen-baseline\.json` does not exist yet/);
    assert.match(run.outputs, /finding-count=1/);
    await assert.rejects(readFile(join(root, ".evergreen-baseline.json")), { code: "ENOENT" }, "the run never writes the file");

    assert.equal(api.bodies.length, 1, "the proposal comment is posted without pr-comment");
    const body = api.bodies[0]!;
    assert.match(body, /^<!-- evergreen-pr-comment -->\n## Evergreen/);
    assert.match(body, /### Suggested file: `\.evergreen-baseline\.json`/);
    assert.equal(body.includes("Baseline:"), false, "nothing was applied, so there is no baseline line");

    const report = JSON.parse(await readFile(join(root, ".runner", "evergreen-report.json"), "utf8")) as { findings: unknown[] };
    const baselinePath = join(root, "proposed-baseline.json");
    await writeFile(baselinePath, fencedJson(body)!);
    const baseline = await readBaseline(baselinePath);
    assert.equal(baseline.schemaVersion, "evergreen.baseline.v1");
    assert.equal(baseline.findings.length, report.findings.length);
    assert.deepEqual(baseline.history?.map((entry) => entry.count), [report.findings.length]);

    const fresh = await scanRepository(root, builtInDetectors);
    assert.deepEqual(applyBaseline(fresh, baseline).findings, [], "the proposal suppresses every finding it recorded");
  } finally {
    await api.close();
  }
});

test("an onboarding run whose baseline exists keeps the normal baseline behavior", async () => {
  const root = await fixtureRepository();
  const baseline = join(root, ".evergreen-baseline.json");
  await writeBaseline(baseline, createBaseline(await scanRepository(root, builtInDetectors)));
  const api = await commentApi();
  try {
    const run = await runAction(root, {
      GITHUB_HEAD_REF: "evergreen/onboarding",
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_EVENT_PATH: await pullRequestEvent(root),
      GITHUB_API_URL: api.url,
      INPUT_BASELINE: ".evergreen-baseline.json",
      "INPUT_GITHUB-TOKEN": "test-token",
      "INPUT_PR-COMMENT": "true",
      "INPUT_FAIL-ON-SEVERITY": "high",
    });

    assert.equal(run.code, 0);
    assert.equal(run.stdout.includes("Evergreen proposed a baseline"), false);
    assert.match(run.summary, /Baseline: 1 finding suppressed/);
    assert.equal(api.bodies.length, 1);
    assert.equal(api.bodies[0]!.includes("Suggested file"), false);
  } finally {
    await api.close();
  }
});

test("an ordinary pull request with a missing baseline still fails and posts nothing", async () => {
  const root = await fixtureRepository();
  const api = await commentApi();
  try {
    const run = await runAction(root, {
      GITHUB_HEAD_REF: "feature/cleanup",
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_EVENT_PATH: await pullRequestEvent(root),
      GITHUB_API_URL: api.url,
      INPUT_BASELINE: ".evergreen-baseline.json",
      "INPUT_GITHUB-TOKEN": "test-token",
      "INPUT_FAIL-ON-SEVERITY": "high",
    });

    assert.equal(run.code, 1);
    assert.match(run.stdout, /Evergreen failed/);
    assert.equal(run.stdout.includes("Evergreen proposed a baseline"), false);
    assert.equal(api.bodies.length, 0);
  } finally {
    await api.close();
  }
});

test("a fork that names its branch evergreen/onboarding does not skip the gate", async () => {
  const root = await fixtureRepository();
  const api = await commentApi();
  try {
    const run = await runAction(root, {
      GITHUB_HEAD_REF: "evergreen/onboarding",
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_EVENT_PATH: await pullRequestEvent(root, "someone/fork"),
      GITHUB_API_URL: api.url,
      INPUT_BASELINE: ".evergreen-baseline.json",
      "INPUT_GITHUB-TOKEN": "test-token",
      "INPUT_FAIL-ON-SEVERITY": "high",
    });

    assert.equal(run.code, 1);
    assert.match(run.stdout, /Evergreen failed/);
    assert.equal(run.stdout.includes("Evergreen proposed a baseline"), false);
    assert.equal(api.bodies.length, 0);
  } finally {
    await api.close();
  }
});

test("a push to the onboarding branch is recognized without a comment target", async () => {
  const root = await fixtureRepository();
  const api = await commentApi();
  try {
    const eventPath = join(root, "event.json");
    await writeFile(eventPath, JSON.stringify({ ref: "refs/heads/evergreen/onboarding" }));
    const run = await runAction(root, {
      GITHUB_HEAD_REF: "",
      GITHUB_REF_NAME: "evergreen/onboarding",
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_API_URL: api.url,
      INPUT_BASELINE: ".evergreen-baseline.json",
      "INPUT_GITHUB-TOKEN": "test-token",
      "INPUT_FAIL-ON-SEVERITY": "high",
    });

    assert.equal(run.code, 0);
    assert.match(run.stdout, /Evergreen proposed a baseline/);
    assert.equal(run.stdout.includes("pull request comment skipped"), true);
    assert.equal(api.bodies.length, 0);
  } finally {
    await api.close();
  }
});
