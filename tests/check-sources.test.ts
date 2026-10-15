import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import {
  checkSources,
  failingCategories,
  fetchObservation,
  isBotChallenge,
  main,
  renderSummary,
  updatedLock,
} from "../tools/check-sources.js";
import type { SourceLock, SourceObservation } from "../tools/check-sources.js";
import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";

const NOW = new Date("2026-10-15T12:00:00Z");

function rule(id: string, urls: string[], reviewedAt = "2026-10-01"): RegistryV2Rule {
  return {
    id,
    ecosystem: "npm",
    purl: `pkg:npm/${id.split(".")[2] ?? "x"}`,
    vers: "vers:npm/*",
    event: "deprecated",
    title: "T",
    summary: "S",
    severity: "high",
    sources: urls.map((url) => ({ title: "Source", url })),
    provenance: { observedAt: "2026-09-01", reviewedAt, reviewer: "maintainer" },
  };
}

function registry(rules: RegistryV2Rule[], maxReviewAgeDays?: number): { name: string; registry: RegistryV2 } {
  return {
    name: "npm",
    registry: {
      schemaVersion: "evergreen.registry.v2",
      ecosystem: "npm",
      ...(maxReviewAgeDays ? { freshness: { maxReviewAgeDays } } : {}),
      rules,
    },
  };
}

const page = (url: string, title: string | null = "Page", status = 200): SourceObservation => ({ status, finalUrl: url, title });
const lockOf = (entries: Record<string, { finalUrl: string; title: string | null }>): SourceLock => ({
  schemaVersion: "evergreen.source-lock.v1",
  sources: Object.fromEntries(Object.entries(entries).map(([url, entry]) => [url, { ...entry, checkedAt: "2026-10-01" }])),
});

test("reports nothing to review when every source is unchanged and every rule is fresh", async () => {
  const url = "https://example.com/a";
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.a.deprecated", [url])])],
    lock: lockOf({ [url]: { finalUrl: url, title: "Page" } }),
    now: NOW,
    observe: async (u) => page(u),
  });
  assert.deepEqual({ ok: report.ok, stale: report.stale, changed: report.changed, unreachable: report.unreachable, blocked: report.blocked, unrecorded: report.unrecorded }, {
    ok: 1, stale: [], changed: [], unreachable: [], blocked: [], unrecorded: [],
  });
  assert.equal(report.sources, 1);
  assert.equal(report.rules, 1);
  assert.deepEqual(failingCategories(report, ["stale", "changed", "unreachable"]), []);
});

test("reports stale rules separately from source problems", async () => {
  const url = "https://example.com/a";
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.old.deprecated", [url], "2025-01-01"), rule("npm.package.new.deprecated", [url], "2026-10-10")], 90)],
    lock: lockOf({ [url]: { finalUrl: url, title: "Page" } }),
    now: NOW,
    observe: async (u) => page(u),
  });
  assert.deepEqual(report.stale.map((entry) => [entry.registry, entry.ruleId, entry.maxReviewAgeDays]), [["npm", "npm.package.old.deprecated", 90]]);
  assert.equal(report.changed.length + report.unreachable.length, 0);
  assert.deepEqual(failingCategories(report, ["stale", "changed", "unreachable"]), ["stale"]);
});

test("reports moved and retitled sources as changed, with the reason", async () => {
  const moved = "https://example.com/moved";
  const retitled = "https://example.com/retitled";
  const both = "https://example.com/both";
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.a.deprecated", [moved, retitled, both])])],
    lock: lockOf({
      [moved]: { finalUrl: moved, title: "Same" },
      [retitled]: { finalUrl: retitled, title: "Before" },
      [both]: { finalUrl: both, title: "Before" },
    }),
    now: NOW,
    observe: async (url) =>
      url === moved ? page("https://example.com/new-home", "Same")
        : url === retitled ? page(url, "After")
          : page("https://example.com/other", "After"),
  });
  assert.deepEqual(report.changed.map((entry) => [entry.url, entry.reasons]), [
    [both, ["final-url", "title"]],
    [moved, ["final-url"]],
    [retitled, ["title"]],
  ]);
  assert.equal(report.changed[0]!.recorded.title, "Before");
  assert.equal(report.changed[0]!.current.finalUrl, "https://example.com/other");
  assert.equal(report.ok, 0);
});

test("ignores differences that are not real changes", async () => {
  const url = "https://Example.com/a/#section";
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.a.deprecated", [url])])],
    lock: lockOf({ [url]: { finalUrl: "https://example.com/a", title: "A   Page" } }),
    now: NOW,
    observe: async () => page("https://example.com/a/", " A Page "),
  });
  assert.equal(report.ok, 1);
  assert.equal(report.changed.length, 0);
});

test("separates unreachable, blocked, and unrecorded sources", async () => {
  const urls = ["https://example.com/gone", "https://example.com/error", "https://example.com/down", "https://example.com/challenge", "https://example.com/forbidden", "https://example.com/fresh"];
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.a.deprecated", urls)])],
    lock: lockOf({}),
    now: NOW,
    observe: async (url) => {
      if (url.endsWith("gone")) return page(url, "Not Found", 404);
      if (url.endsWith("error")) return page(url, "Oops", 500);
      if (url.endsWith("down")) return { status: null, finalUrl: null, title: null, error: "fetch failed" };
      if (url.endsWith("challenge")) return page(url, "Just a moment...", 403);
      if (url.endsWith("forbidden")) return page(url, "Forbidden", 403);
      return page(url);
    },
  });
  assert.deepEqual(report.unreachable.map((entry) => [entry.url.split("/").pop(), entry.reason]), [
    ["down", "fetch failed"], ["error", "HTTP 500"], ["forbidden", "HTTP 403"], ["gone", "HTTP 404"],
  ]);
  assert.deepEqual(report.blocked.map((entry) => entry.url.split("/").pop()), ["challenge"]);
  assert.deepEqual(report.unrecorded.map((entry) => entry.url.split("/").pop()), ["fresh"]);
  assert.deepEqual(failingCategories(report, ["stale", "changed", "unreachable"]), ["unreachable"]);
});

test("recognizes bot challenges only on blocking statuses", () => {
  assert.equal(isBotChallenge(page("u", "Just a moment...", 403)), true);
  assert.equal(isBotChallenge(page("u", "Attention Required! | Cloudflare", 503)), true);
  assert.equal(isBotChallenge(page("u", "Just a moment...", 200)), false);
  assert.equal(isBotChallenge(page("u", "Forbidden", 403)), false);
  assert.equal(isBotChallenge({ status: null, finalUrl: null, title: null }), false);
});

test("fetches each shared URL once and lists every rule that cites it", async () => {
  const shared = "https://example.com/shared";
  const calls: string[] = [];
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.b.deprecated", [shared]), rule("npm.package.a.deprecated", [shared, "https://example.com/own"])])],
    lock: lockOf({}),
    now: NOW,
    observe: async (url) => { calls.push(url); return page(url); },
  });
  assert.deepEqual([...calls].sort(), ["https://example.com/own", shared]);
  assert.deepEqual(report.unrecorded.find((entry) => entry.url === shared)?.ruleIds, ["npm.package.a.deprecated", "npm.package.b.deprecated"]);
  assert.equal(report.sources, 2);
});

test("produces the same report regardless of fetch completion order and honors the concurrency limit", async () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://example.com/p${index}`);
  let running = 0;
  let peak = 0;
  const run = async (delay: (index: number) => number) => {
    const { report } = await checkSources({
      registries: [registry([rule("npm.package.a.deprecated", urls)])],
      lock: lockOf({}),
      now: NOW,
      concurrency: 3,
      observe: async (url) => {
        running++; peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, delay(urls.indexOf(url))));
        running--;
        return page(url);
      },
    });
    return JSON.stringify(report);
  };
  assert.equal(await run((index) => index), await run((index) => 12 - index));
  assert.ok(peak <= 3, `peak concurrency ${peak}`);
});

test("accepting an observation records reachable pages and keeps earlier entries for failures", () => {
  const ok = "https://example.com/ok";
  const down = "https://example.com/down";
  const removed = "https://example.com/removed";
  const lock = lockOf({ [ok]: { finalUrl: ok, title: "Old" }, [down]: { finalUrl: down, title: "Kept" }, [removed]: { finalUrl: removed, title: "No longer cited" } });
  const next = updatedLock(lock, new Map<string, SourceObservation>([
    [ok, page("https://example.com/ok-new", "New")],
    [down, { status: 500, finalUrl: down, title: "Oops" }],
  ]), NOW);
  assert.deepEqual(next.sources, {
    [down]: lock.sources[down],
    [ok]: { finalUrl: "https://example.com/ok-new", title: "New", checkedAt: "2026-10-15" },
  });
});

test("renders a summary a maintainer can act on", async () => {
  const { report } = await checkSources({
    registries: [registry([rule("npm.package.a.deprecated", ["https://example.com/gone"], "2024-01-01")])],
    lock: lockOf({}),
    now: NOW,
    observe: async (url) => page(url, "Not Found", 404),
  });
  const text = renderSummary(report);
  assert.match(text, /\| Unreachable sources \| 1 \|/);
  assert.match(text, /\| Stale rules .* \| 1 \|/);
  assert.match(text, /`npm\.package\.a\.deprecated` \(npm\): reviewed 2024-01-01/);
  assert.match(text, /https:\/\/example\.com\/gone: HTTP 404; rules: `npm\.package\.a\.deprecated`/);
  assert.match(text, /Rules are never edited by this check/);
});

test("rejects unknown --fail-on categories before touching the network", async () => {
  await assert.rejects(main(["--fail-on", "everything"]), /Unknown --fail-on category "everything"/);
  await assert.rejects(main(["--out"]), /--out needs a value/);
  await assert.rejects(main(["registry"]), /Unexpected argument/);
});

test("fetchObservation follows redirects, reads the title, retries once, and reports failures", async (t) => {
  let flaky = 0;
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/page") return void response.writeHead(200, { "content-type": "text/html" }).end("<html><head><title>\n  Hello &amp;\n  World </title></head><body>x</body></html>");
    if (url === "/redirect") return void response.writeHead(302, { location: "/page" }).end();
    if (url === "/missing") return void response.writeHead(404).end("<title>Gone</title>");
    if (url === "/flaky") return void response.writeHead(++flaky === 1 ? 500 : 200, { "content-type": "text/html" }).end("<title>Recovered</title>");
    if (url === "/slow") return; // never answers
    if (url === "/plain") return void response.writeHead(200, { "content-type": "application/json" }).end('{"a":1}');
    response.writeHead(400).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  assert.deepEqual(await fetchObservation(`${base}/page`), { status: 200, finalUrl: `${base}/page`, title: "Hello &amp; World" });
  assert.deepEqual(await fetchObservation(`${base}/redirect`), { status: 200, finalUrl: `${base}/page`, title: "Hello &amp; World" });
  assert.deepEqual(await fetchObservation(`${base}/missing`), { status: 404, finalUrl: `${base}/missing`, title: "Gone" });
  assert.equal((await fetchObservation(`${base}/flaky`)).title, "Recovered");
  assert.equal((await fetchObservation(`${base}/plain`)).title, null);

  const slow = await fetchObservation(`${base}/slow`, 150);
  assert.equal(slow.status, null);
  assert.ok(slow.error);
  const refused = await fetchObservation("http://127.0.0.1:1/", 500);
  assert.equal(refused.status, null);
});
