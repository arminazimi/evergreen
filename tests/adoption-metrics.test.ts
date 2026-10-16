import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { collect, distinctRepositories, parseDownloads, parseMcpRegistry, parseSkillsInstalls, SCHEMA_VERSION } from "../tools/adoption-metrics.js";
import type { Fetcher, Metric, Snapshot } from "../tools/adoption-metrics.js";

test("counts distinct repositories and leaves out the project's own", () => {
  const item = (name: string) => ({ repository: { full_name: name } });
  assert.equal(distinctRepositories([item("a/one"), item("a/one"), item("B/Two"), item("b/two"), item("arminazimi/evergreen"), item("arminazimi/other"), {}]), 2);
  assert.equal(distinctRepositories([]), 0);
});

test("reads npm downloads and reports an unpublished package as unavailable", () => {
  assert.deepEqual(parseDownloads(200, '{"downloads": 42}'), { status: "ok", value: 42, source: "https://api.npmjs.org/downloads/point/last-week/evergreen-deprecation" });
  assert.equal(parseDownloads(404, '{"error":"package evergreen-deprecation not found"}').status, "unavailable");
  assert.equal(parseDownloads(500, "").status, "unavailable");
  assert.equal(parseDownloads(200, "{}").status, "unavailable");
});

test("finds the MCP Registry entry by repository", () => {
  const listed = JSON.stringify({ servers: [{ server: { name: "io.github.other/x", repository: { url: "https://github.com/other/x" } } }, { server: { name: "io.github.arminazimi/evergreen", repository: { url: "https://github.com/arminazimi/evergreen" } } }] });
  assert.deepEqual(parseMcpRegistry(200, listed), { status: "ok", value: true, detail: "io.github.arminazimi/evergreen", source: "https://registry.modelcontextprotocol.io/v0/servers?search=evergreen-deprecation" });
  assert.equal((parseMcpRegistry(200, '{"servers":[]}') as { value: boolean }).value, false);
  assert.equal(parseMcpRegistry(503, "").status, "unavailable");
});

test("reads the skills.sh install count from the page's structured data", () => {
  assert.equal((parseSkillsInstalls(200, '..."userInteractionCount":4}...') as { value: number }).value, 4);
  assert.equal(parseSkillsInstalls(200, "<html></html>").status, "unavailable");
  assert.equal(parseSkillsInstalls(404, "").status, "unavailable");
});

test("one failing source is recorded and does not stop the others", async () => {
  const fetcher: Fetcher = async (url) => {
    if (url.includes("npmjs.org")) throw new Error("network down");
    if (url.includes("skills.sh")) return { status: 200, text: '"userInteractionCount": 7' };
    if (url.includes("registry.modelcontextprotocol.io")) return { status: 200, text: '{"servers":[]}' };
    if (url.includes("api.github.com/repos/")) return { status: 200, text: '{"stargazers_count": 3, "forks_count": 1}' };
    return { status: 200, text: JSON.stringify({ total_count: 2, items: [{ repository: { full_name: "x/a" } }, { repository: { full_name: "x/b" } }] }) };
  };
  const snapshot = await collect("2026-10-16", fetcher, "token");
  assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual([snapshot.metrics.npmWeeklyDownloads!.status, (snapshot.metrics.npmWeeklyDownloads as { reason: string }).reason], ["unavailable", "network down"]);
  assert.equal((snapshot.metrics.githubActionRepositories as { value: number }).value, 2);
  assert.equal((snapshot.metrics.skillsShInstalls as { value: number }).value, 7);
  assert.equal((snapshot.metrics.githubStars as { value: number }).value, 3);
});

test("without a token the code-search metrics are unavailable, never zero", async () => {
  const snapshot = await collect("2026-10-16", async () => ({ status: 404, text: "" }), undefined);
  for (const name of ["githubActionRepositories", "preCommitRepositories", "gitlabComponentRepositories"]) {
    assert.equal(snapshot.metrics[name]!.status, "unavailable", name);
  }
});

test("every committed snapshot is well formed and named after its date", async () => {
  const names = (await readdir(resolve("metrics/adoption"))).filter((name) => name.endsWith(".json")).sort();
  assert.ok(names.length >= 1);
  for (const name of names) {
    const snapshot = JSON.parse(await readFile(resolve("metrics/adoption", name), "utf8")) as Snapshot;
    assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
    assert.equal(`${snapshot.date}.json`, name);
    const documented = await readFile(resolve("docs/ADOPTION.md"), "utf8");
    for (const [metric, value] of Object.entries(snapshot.metrics) as Array<[string, Metric]>) {
      assert.ok(documented.includes(`\`${metric}\``), `${metric} is not documented in docs/ADOPTION.md`);
      assert.ok(value.status === "ok" || value.reason.length > 0, metric);
      assert.match(value.source, /^https:\/\//, metric);
    }
  }
});
