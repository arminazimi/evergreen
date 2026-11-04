import assert from "node:assert/strict";
import { test } from "node:test";

import { HOOK_TIMEOUT_MS, findingsAtGate, hookResponse, parseHookArguments } from "../src/agent-hooks/command.js";
import { failOpen, findingsForEdit } from "../src/agent-hooks/index.js";
import type { HostAdapter } from "../src/agent-hooks/types.js";
import type { Finding, Severity } from "../src/domain.js";

const finding = (id: string, path: string, line: number, severity: Severity = "high"): Finding => ({
  id,
  ruleId: id.split(":")[0]!,
  detector: "test",
  title: id,
  summary: "",
  severity,
  confidence: "exact",
  location: { path, line },
  sources: [{ title: "Source", url: `https://example.test/${id}` }],
});

const editPayload = { root: "/repo", files: ["Dockerfile"] };

/** A minimal adapter: the payload names files, and the response echoes how many findings survived the gate. */
const adapter: HostAdapter = {
  id: "fake",
  parse(payload) {
    const value = payload as { root?: string; files?: string[] };
    return value.files === undefined ? undefined : { root: value.root ?? "/repo", files: value.files };
  },
  respond(findings) {
    return findings.length === 0
      ? failOpen
      : { stdout: findings.map((entry) => entry.id).join("\n") + "\n", stderr: "", exitCode: 2 };
  },
};

const findings = [
  finding("b.rule:Dockerfile", "Dockerfile", 1, "medium"),
  finding("a.rule:Dockerfile", "Dockerfile", 1, "critical"),
  finding("a.rule:Dockerfile:line9", "Dockerfile", 9, "low"),
  finding("other.rule:README.md", "README.md", 1, "critical"),
];

const run = (argv: string[], payload: unknown = editPayload, options: Parameters<typeof hookResponse>[2] = {}) =>
  hookResponse(argv, typeof payload === "string" ? payload : JSON.stringify(payload), {
    adapters: [adapter],
    scan: async () => ({ findings }),
    ...options,
  });

test("findingsForEdit keeps the edited files and orders them by path, line, then id", () => {
  const edit = { root: "/repo", files: ["Dockerfile", "README.md"] };
  assert.deepEqual(
    findingsForEdit([...findings].reverse(), edit).map((entry) => entry.id),
    ["a.rule:Dockerfile", "b.rule:Dockerfile", "a.rule:Dockerfile:line9", "other.rule:README.md"],
  );
  assert.deepEqual(findingsForEdit(findings, { root: "/repo", files: [] }), []);
  assert.deepEqual(
    findingsForEdit(findings, { root: "/repo", files: ["README.md"] }).map((entry) => entry.id),
    ["other.rule:README.md"],
  );
});

test("the default gate is medium: low and info findings stay quiet", async () => {
  const response = await run(["fake"]);
  assert.equal(response.exitCode, 2);
  assert.deepEqual(response.stdout.trimEnd().split("\n"), ["a.rule:Dockerfile", "b.rule:Dockerfile"]);
});

test("--fail-on raises and lowers the gate, and none reports nothing", async () => {
  assert.deepEqual((await run(["fake", "--fail-on", "critical"])).stdout.trimEnd().split("\n"), ["a.rule:Dockerfile"]);
  assert.deepEqual((await run(["fake", "--fail-on", "low"])).stdout.trimEnd().split("\n"), [
    "a.rule:Dockerfile",
    "b.rule:Dockerfile",
    "a.rule:Dockerfile:line9",
  ]);
  assert.deepEqual(await run(["fake", "--fail-on", "none"]), failOpen);
});

test("arguments parse the host and the gate, and reject an unknown severity", () => {
  assert.deepEqual(parseHookArguments(["fake"]), { host: "fake", gate: "medium" });
  assert.deepEqual(parseHookArguments(["fake", "--fail-on", "none"]), { host: "fake", gate: "none" });
  assert.deepEqual(parseHookArguments(["fake", "--fail-on", "bogus"]), undefined);
  assert.deepEqual(parseHookArguments([]), undefined);
  assert.deepEqual(parseHookArguments(["a", "b"]), undefined);
});

test("a --fail-on with no value, or no host, fails open through the hook and never throws", async () => {
  assert.deepEqual(parseHookArguments(["fake", "--fail-on"]), undefined);
  assert.deepEqual(await run(["fake", "--fail-on"]), failOpen);
  assert.deepEqual(await run(["--fail-on", "low"]), failOpen);
  assert.deepEqual(await run([]), failOpen);
});

test("a none gate keeps no findings for any edit", () => {
  assert.deepEqual(findingsAtGate(findings, "none", editPayload), []);
});

test("an unknown host fails open", async () => {
  assert.deepEqual(await run(["nope"]), failOpen);
});

test("a malformed payload, a non-edit event, and a thrown scan all fail open", async () => {
  assert.deepEqual(await run(["fake"], "{not json"), failOpen);
  assert.deepEqual(await run(["fake"], { not: "an edit" }), failOpen);
  const thrown = await run(["fake"], editPayload, {
    scan: async () => {
      throw new Error("scan exploded");
    },
  });
  assert.deepEqual(thrown, failOpen);
});

test("a scan that exceeds the budget fails open", async () => {
  const response = await run(["fake"], editPayload, {
    timeoutMs: 20,
    scan: () => new Promise(() => undefined),
  });
  assert.deepEqual(response, failOpen);
});

test("the default budget is ten seconds", () => {
  assert.equal(HOOK_TIMEOUT_MS, 10_000);
});
