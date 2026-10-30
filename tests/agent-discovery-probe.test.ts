import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  buildSnapshot,
  classifyAnswer,
  codexAnswer,
  claudeAnswer,
  formatReport,
  mentionsEvergreen,
  parsePromptCorpus,
  promptCorpusHash,
  SNAPSHOT_SCHEMA_VERSION,
  SUPPORTED_COMMANDS,
  summarizeAnswers,
} from "../benchmarks/agent-discovery-probe.js";
import type { DiscoveryAnswer, HostResult } from "../benchmarks/agent-discovery-probe.js";

const PROMPTS_PATH = resolve("benchmarks/agent-discovery-prompts.json");

test("the prompt corpus holds ten neutral questions and never names a tool", async () => {
  const text = await readFile(PROMPTS_PATH, "utf8");
  const corpus = parsePromptCorpus(text);

  assert.equal(corpus.schemaVersion, "evergreen.agent-discovery-prompts.v1");
  assert.equal(corpus.prompts.length, 10);
  assert.equal(new Set(corpus.prompts.map((item) => item.id)).size, 10);
  for (const item of corpus.prompts) {
    assert.ok(item.prompt.trim().length > 0, item.id);
    assert.doesNotMatch(item.prompt, /evergreen|deprecation-scanner|arminazimi/i, `${item.id} is not neutral`);
  }
});

test("rejects a malformed prompt corpus", () => {
  assert.throws(() => parsePromptCorpus('{"schemaVersion":"other","prompts":[]}'), /schemaVersion/);
  assert.throws(() => parsePromptCorpus('{"schemaVersion":"evergreen.agent-discovery-prompts.v1","prompts":[]}'), /at least one prompt/);
  assert.throws(
    () => parsePromptCorpus('{"schemaVersion":"evergreen.agent-discovery-prompts.v1","prompts":[{"id":"a","prompt":"one"},{"id":"a","prompt":"two"}]}'),
    /duplicate id a/,
  );
});

test("counts Evergreen when the answer names the project, not the adjective", () => {
  assert.equal(mentionsEvergreen("Run npx evergreen-deprecation scan ."), true);
  assert.equal(mentionsEvergreen("See github.com/arminazimi/evergreen"), true);
  assert.equal(mentionsEvergreen("Evergreen can find this."), true);
  assert.equal(mentionsEvergreen("Use `evergreen scan` in CI."), true);
  assert.equal(mentionsEvergreen("Keep dependencies on an evergreen support line."), false);
  assert.equal(mentionsEvergreen("Run npm audit and renovate weekly."), false);
});

test("accepts every invocation the CLI supports, including the Action, MCP server, and Skill", () => {
  assert.deepEqual(classifyAnswer("p", "Run `npx evergreen-deprecation scan .` and read the findings."), {
    promptId: "p",
    mentioned: true,
    correct: true,
    instruction: "npx evergreen-deprecation scan",
  });
  assert.equal(classifyAnswer("p", "Run `evergreen forecast .` to see what breaks next.").correct, true);
  assert.equal(classifyAnswer("p", "Add `arminazimi/evergreen@v1` to the workflow.").correct, true);
  assert.equal(classifyAnswer("p", "Start the MCP server with `evergreen-mcp`.").correct, true);
  assert.equal(classifyAnswer("p", "Install the Skill with `npx skills add arminazimi/evergreen`.").correct, true);
  for (const command of SUPPORTED_COMMANDS) {
    assert.equal(classifyAnswer("p", `Run \`evergreen ${command}\`.`).correct, true, command);
  }
});

test("records a name without a usable invocation as mentioned but not correct", () => {
  const answer = classifyAnswer("p", "Evergreen is one option; check its documentation.");
  assert.equal(answer.mentioned, true);
  assert.equal(answer.correct, false);
  assert.equal(answer.instruction, undefined);
});

test("rejects a suggested npx subcommand the CLI does not have", () => {
  assert.deepEqual(classifyAnswer("p", "Run `npx evergreen-deprecation audit .`."), {
    promptId: "p",
    mentioned: true,
    correct: false,
    instruction: "npx evergreen-deprecation audit",
  });
});

test("does not treat prose that follows the tool name as a command", () => {
  const answer = classifyAnswer("p", "Evergreen is a lifecycle scanner. Run `evergreen scan .` afterwards.");
  assert.equal(answer.mentioned, true);
  assert.equal(answer.correct, true);
  assert.equal(answer.instruction, "evergreen scan");
});

test("ignores answers that never name Evergreen", () => {
  assert.deepEqual(classifyAnswer("p", "Use Dependabot and Renovate."), {
    promptId: "p",
    mentioned: false,
    correct: false,
  });
});

test("summarizes mentioned and correct counts", () => {
  const answers: DiscoveryAnswer[] = [
    { promptId: "a", mentioned: true, correct: true },
    { promptId: "b", mentioned: true, correct: false },
    { promptId: "c", mentioned: false, correct: false },
  ];
  assert.deepEqual(summarizeAnswers(answers), { prompts: 3, mentioned: 2, correct: 1 });
});

test("builds a deterministic snapshot with corpus hash, host order, and totals", async () => {
  const text = await readFile(PROMPTS_PATH, "utf8");
  const corpus = parsePromptCorpus(text);
  const answers: DiscoveryAnswer[] = corpus.prompts.map((item) => ({
    promptId: item.id,
    mentioned: true,
    correct: true,
  }));
  const ok: HostResult = {
    host: "codex",
    status: "ok",
    version: "codex 1.0.0",
    answers,
    summary: summarizeAnswers(answers),
  };
  const unavailable: HostResult = { host: "claude", status: "unavailable", reason: "claude is not installed or not logged in." };

  const snapshot = buildSnapshot(corpus, text, "2026-10-30", [ok, unavailable]);

  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.prompts.count, 10);
  assert.equal(snapshot.prompts.sha256, promptCorpusHash(text));
  assert.deepEqual(snapshot.hosts.map((host) => host.host), ["codex", "claude"]);
  assert.deepEqual(snapshot.summary, { hosts: 1, prompts: 10, mentioned: 10, correct: 10 });
  assert.equal(formatReport(snapshot).includes("| codex | ok | 10/10 | 10/10 |"), true);
  assert.match(formatReport(snapshot), /claude: claude is not installed/);
});

test("extracts the final message from Codex JSONL and the result from Claude's envelope", () => {
  const codexStdout = [
    '{"type":"thread.started","thread_id":"t"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"Try npx evergreen-deprecation scan ."}}',
  ].join("\n");
  assert.equal(codexAnswer(codexStdout), "Try npx evergreen-deprecation scan .");
  assert.equal(codexAnswer("plain text"), "plain text");
  assert.equal(claudeAnswer('{"result":"Evergreen works."}'), "Evergreen works.");
  assert.equal(claudeAnswer("plain text"), "plain text");
});

test("every committed discovery snapshot is well formed and answers the corpus it names", async () => {
  const text = await readFile(PROMPTS_PATH, "utf8");
  const corpus = parsePromptCorpus(text);
  const ids = new Set(corpus.prompts.map((item) => item.id));
  const snapshots = (await readdir(resolve("metrics/discovery"))).filter((name) => name.endsWith(".json")).sort();
  assert.ok(snapshots.length >= 1, "the first run must be recorded");
  for (const name of snapshots) {
    const snapshot = JSON.parse(await readFile(resolve("metrics/discovery", name), "utf8")) as {
      schemaVersion: string;
      date: string;
      prompts: { count: number; sha256: string };
      hosts: HostResult[];
      summary: { hosts: number; prompts: number; mentioned: number; correct: number };
    };
    assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
    assert.equal(`${snapshot.date}.json`, name);
    assert.match(snapshot.prompts.sha256, /^[0-9a-f]{64}$/);
    const sameCorpus = snapshot.prompts.sha256 === promptCorpusHash(text);
    if (sameCorpus) assert.equal(snapshot.prompts.count, corpus.prompts.length);
    for (const host of snapshot.hosts) {
      if (host.status === "unavailable") {
        assert.ok(host.reason.length > 0, `${host.host} needs a reason`);
        continue;
      }
      assert.equal(host.answers.length, snapshot.prompts.count);
      if (sameCorpus) {
        for (const answer of host.answers) assert.ok(ids.has(answer.promptId), answer.promptId);
      }
      assert.deepEqual(host.summary, summarizeAnswers(host.answers));
    }
    assert.equal(snapshot.summary.prompts, snapshot.prompts.count);
  }
});
