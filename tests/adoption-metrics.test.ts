import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  collect,
  countRepeatRepositories,
  distinctRepositories,
  distinctRepositoryNames,
  parseContributorMetrics,
  parseDownloads,
  parseMcpRegistry,
  parseScorecard,
  parseSkillsInstalls,
  previousMonth,
  SCHEMA_VERSION,
  SERVICE_REPORTS,
} from "../tools/adoption-metrics.js";
import type { Fetcher, Metric, Snapshot } from "../tools/adoption-metrics.js";

test("counts distinct repositories and leaves out the project's own", () => {
  const item = (name: string) => ({ repository: { full_name: name } });
  assert.equal(distinctRepositories([item("a/one"), item("a/one"), item("B/Two"), item("b/two"), item("arminazimi/evergreen"), item("arminazimi/other"), {}]), 2);
  assert.equal(distinctRepositories([]), 0);
  assert.deepEqual(distinctRepositoryNames([item("b/two"), item("a/one"), item("arminazimi/evergreen")]), ["a/one", "b/two"]);
});

test("calculates previous calendar month correctly across month and year boundaries", () => {
  assert.equal(previousMonth("2026-10-28"), "2026-09");
  assert.equal(previousMonth("2026-01-15"), "2025-12");
  assert.equal(previousMonth("2027-03-01"), "2027-02");
});

test("counts repeat repositories active in consecutive months", () => {
  const current = ["org/repo-a", "org/repo-b", "org/repo-c"];
  const previous = ["org/repo-b", "ORG/REPO-C", "org/repo-d"];
  assert.equal(countRepeatRepositories(current, previous), 2);
  assert.equal(countRepeatRepositories(current, []), 0);
  assert.equal(countRepeatRepositories([], previous), 0);
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

test("reads the Scorecard score and reports a missing score as unavailable", () => {
  assert.deepEqual(parseScorecard(200, '{"score": 3.1}'), {
    status: "ok",
    value: 3.1,
    detail: "https://securityscorecards.dev/viewer/?uri=github.com/arminazimi/evergreen",
    source: "https://api.securityscorecards.dev/projects/github.com/arminazimi/evergreen",
  });
  assert.equal(parseScorecard(404, '{"message":"repo not found"}').status, "unavailable");
  assert.equal(parseScorecard(500, "").status, "unavailable");
  assert.equal(parseScorecard(200, "{}").status, "unavailable");
  assert.equal(parseScorecard(200, "invalid-json").status, "unavailable");
});

test("parses external and first-time contributors from merged PR search results", () => {
  const data = JSON.stringify({
    items: [
      // September contributor with an October PR (not first-time in October)
      { user: { login: "sept-user", type: "User" }, closed_at: "2026-09-20T10:00:00Z" },
      { user: { login: "sept-user", type: "User" }, closed_at: "2026-10-05T10:00:00Z" },
      // Contributor whose only PR is in October (first-time in October)
      { user: { login: "oct-user", type: "User" }, closed_at: "2026-10-12T10:00:00Z" },
      // Contributor with two PRs both in October (first-time in October)
      { user: { login: "oct-repeat", type: "User" }, closed_at: "2026-10-02T10:00:00Z" },
      { user: { login: "oct-repeat", type: "User" }, closed_at: "2026-10-14T10:00:00Z" },
      // Contributor with no closed_at (counts as external, but ignored for first-time)
      { user: { login: "no-date", type: "User" } },
      // Owner (excluded)
      { user: { login: "arminazimi", type: "User" }, closed_at: "2026-10-01T10:00:00Z" },
      // Bots (excluded)
      { user: { login: "renovate[bot]", type: "Bot" }, closed_at: "2026-10-01T10:00:00Z" },
      { user: { login: "custom-bot[bot]", type: "User" }, closed_at: "2026-10-01T10:00:00Z" },
    ],
  });
  const result = parseContributorMetrics(200, data, "2026-10-28");
  assert.equal(result.externalContributors.status, "ok");
  assert.equal((result.externalContributors as { value: number }).value, 4);
  assert.equal(result.firstTimeContributors.status, "ok");
  assert.equal((result.firstTimeContributors as { value: number }).value, 2);
});

test("reports contributor metrics as unavailable on HTTP error or invalid response", () => {
  const httpErr = parseContributorMetrics(500, "", "2026-10-28");
  assert.equal(httpErr.externalContributors.status, "unavailable");
  assert.equal(httpErr.firstTimeContributors.status, "unavailable");

  const badJson = parseContributorMetrics(200, "not json", "2026-10-28");
  assert.equal(badJson.externalContributors.status, "unavailable");
  assert.equal(badJson.firstTimeContributors.status, "unavailable");

  const noItems = parseContributorMetrics(200, "{}", "2026-10-28");
  assert.equal(noItems.externalContributors.status, "unavailable");
  assert.equal(noItems.firstTimeContributors.status, "unavailable");
});

test("one failing source is recorded and does not stop the others", async () => {
  const fetcher: Fetcher = async (url) => {
    if (url.includes("npmjs.org")) throw new Error("network down");
    if (url.includes("skills.sh")) return { status: 200, text: '"userInteractionCount": 7' };
    if (url.includes("registry.modelcontextprotocol.io")) return { status: 200, text: '{"servers":[]}' };
    if (url.includes("api.github.com/repos/")) return { status: 200, text: '{"stargazers_count": 3, "forks_count": 1}' };
    if (url.includes("securityscorecards.dev")) return { status: 200, text: '{"score": 3.1}' };
    if (url.includes("search/issues")) {
      return {
        status: 200,
        text: JSON.stringify({
          total_count: 3,
          items: [
            { user: { login: "contributor-one", type: "User" }, closed_at: "2026-10-05T12:00:00Z" },
            { user: { login: "contributor-one", type: "User" }, closed_at: "2026-10-10T12:00:00Z" },
            { user: { login: "contributor-two", type: "User" }, closed_at: "2026-10-15T12:00:00Z" },
          ],
        }),
      };
    }
    return { status: 200, text: JSON.stringify({ total_count: 2, items: [{ repository: { full_name: "x/a" } }, { repository: { full_name: "x/b" } }] }) };
  };
  const snapshot = await collect("2026-10-16", fetcher, "token");
  assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual([snapshot.metrics.npmWeeklyDownloads!.status, (snapshot.metrics.npmWeeklyDownloads as { reason: string }).reason], ["unavailable", "network down"]);
  assert.equal((snapshot.metrics.githubActionRepositories as { value: number }).value, 2);
  assert.equal((snapshot.metrics.repeatActionRepositories as { value: number }).value, 0);
  assert.equal((snapshot.metrics.skillsShInstalls as { value: number }).value, 7);
  assert.equal((snapshot.metrics.githubStars as { value: number }).value, 3);
  assert.equal((snapshot.metrics.scorecardScore as { value: number }).value, 3.1);
  assert.equal((snapshot.metrics.externalContributors as { value: number }).value, 2);
  assert.equal((snapshot.metrics.firstTimeContributors as { value: number }).value, 2);
  assert.deepEqual(snapshot.serviceReports, SERVICE_REPORTS);
});

test("without a token the code-search metrics are unavailable, never zero", async () => {
  const snapshot = await collect("2026-10-16", async () => ({ status: 404, text: "" }), undefined);
  for (const name of ["githubActionRepositories", "repeatActionRepositories", "preCommitRepositories", "gitlabComponentRepositories"]) {
    assert.equal(snapshot.metrics[name]!.status, "unavailable", name);
  }
});

test("counts repeat action repositories across consecutive months", async () => {
  const tmp = await mkdtemp(resolve(tmpdir(), "evergreen-repeat-"));
  try {
    const prevSnapshot: Snapshot = {
      schemaVersion: SCHEMA_VERSION,
      date: "2026-09-15",
      metrics: {
        githubActionRepositories: {
          status: "ok",
          value: 2,
          repositories: ["user/retained", "user/churned"],
          source: "https://github.com/search?type=code&q=test",
        },
      },
    };
    await writeFile(resolve(tmp, "2026-09-15.json"), JSON.stringify(prevSnapshot));

    const fetcher: Fetcher = async (url) => {
      if (url.includes("search/code")) {
        return {
          status: 200,
          text: JSON.stringify({
            total_count: 2,
            items: [{ repository: { full_name: "USER/RETAINED" } }, { repository: { full_name: "user/new" } }],
          }),
        };
      }
      return { status: 200, text: "{}" };
    };

    const snapshot = await collect("2026-10-15", fetcher, "token", tmp);
    assert.equal((snapshot.metrics.githubActionRepositories as { value: number }).value, 2);
    assert.equal((snapshot.metrics.repeatActionRepositories as { value: number }).value, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
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
    if (snapshot.serviceReports) {
      for (const [service, url] of Object.entries(snapshot.serviceReports)) {
        assert.ok(documented.includes(`\`${service}\``), `${service} is not documented in docs/ADOPTION.md`);
        assert.match(url, /^https:\/\//, service);
      }
    }
  }
});
