import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { registryV2Issues } from "../../src/registry.js";
import { EXAMPLE_FEED_URL, exampleImporter } from "../../tools/importers/example.js";
import { ImporterError, liveContext, runImporter } from "../../tools/importers/run.js";
import { PENDING_REVIEWER } from "../../tools/importers/types.js";
import type { DraftRule, Importer, ImporterContext } from "../../tools/importers/types.js";

const run = promisify(execFile);
const NOW = new Date("2026-10-15T09:30:00Z");

const feed = {
  products: [
    { name: "zeta", status: "eol", title: "zeta is end-of-life", summary: "No longer maintained.", url: "https://example.com/zeta", date: "2024-01-31", replacement: "zeta-ng" },
    { name: "acme-widget", status: "deprecated", versionsBefore: "2.0.0", title: "acme-widget before 2.0 is deprecated", summary: "Use 2.x.", url: "https://example.com/acme" },
    { name: "mystery", status: "sunsetting", title: "?", summary: "?", url: "https://example.com/mystery" },
  ],
};

function context(responses: Record<string, string>): ImporterContext {
  return {
    now: NOW,
    async fetchText(url) {
      const body = responses[url];
      if (body === undefined) throw new Error(`unexpected request: ${url}`);
      return body;
    },
  };
}

const draft = (id: string, extra: Partial<DraftRule> = {}): DraftRule => ({
  id,
  ecosystem: "npm",
  purl: `pkg:npm/${id.split(".")[2]}`,
  vers: "vers:npm/*",
  event: "deprecated",
  title: "T",
  summary: "S",
  severity: "medium",
  sources: [{ title: "Source", url: "https://example.com/s" }],
  ...extra,
});

const importerReturning = (rules: DraftRule[], notes: string[] = [], overrides: Partial<Importer> = {}): Importer => ({
  id: "test-importer",
  ecosystem: "npm",
  description: "test",
  sources: [],
  import: async () => ({ rules, notes }),
  ...overrides,
});

test("the runner stamps provenance that marks every draft as unreviewed", async () => {
  const result = await runImporter(importerReturning([draft("npm.package.a.deprecated")]), context({}));
  assert.deepEqual(result.rules[0]!.provenance, {
    observedAt: "2026-10-15",
    reviewedAt: "2026-10-15",
    reviewer: PENDING_REVIEWER,
    importer: "test-importer",
  });
  assert.equal(result.observedAt, "2026-10-15");
  assert.equal(PENDING_REVIEWER, "pending-review");
});

test("drafts are sorted by id and use the registry's field order", async () => {
  const result = await runImporter(importerReturning([
    draft("npm.package.b.deprecated", { "x-npm": { package: "b" }, replacement: "c" }),
    draft("npm.package.a.deprecated"),
  ]), context({}));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["npm.package.a.deprecated", "npm.package.b.deprecated"]);
  assert.deepEqual(Object.keys(result.rules[1]!), ["id", "ecosystem", "purl", "vers", "event", "title", "summary", "severity", "replacement", "sources", "provenance", "x-npm"]);
});

test("a run is deterministic", async () => {
  const importer = importerReturning([draft("npm.package.b.deprecated"), draft("npm.package.a.deprecated")]);
  assert.equal(JSON.stringify(await runImporter(importer, context({}))), JSON.stringify(await runImporter(importer, context({}))));
});

test("the runner rejects importers that set provenance, return invalid rules, or break the contract", async (t) => {
  const reject = async (name: string, importer: Importer, expected: RegExp) =>
    t.test(name, async () => {
      await assert.rejects(runImporter(importer, context({})), (error: unknown) => {
        assert.ok(error instanceof ImporterError);
        assert.match(error.message, expected);
        return true;
      });
    });

  await reject("sets provenance", importerReturning([{ ...draft("npm.package.a.deprecated"), provenance: { observedAt: "2020-01-01", reviewedAt: "2020-01-01", reviewer: "me" } } as unknown as DraftRule]), /must not set provenance/);
  await reject("invalid rule", importerReturning([draft("npm.package.a.deprecated", { purl: "pkg:npm/a@1.0.0" })]), /Importer "test-importer" produced invalid draft rules[\s\S]*purl must be canonical and version-less/);
  await reject("duplicate ids", importerReturning([draft("npm.package.a.deprecated"), draft("npm.package.a.deprecated")]), /id is duplicated/);
  await reject("wrong ecosystem", importerReturning([draft("npm.package.a.deprecated", { ecosystem: "pypi" })]), /does not match the registry ecosystem "npm"/);
  await reject("blank note", importerReturning([], [" "]), /rules and notes/);
  await reject("bad importer id", importerReturning([], [], { id: "Bad_Id" }), /id must use lowercase/);
  await reject("bad ecosystem", importerReturning([], [], { ecosystem: "Not A Slug" }), /ecosystem must be a lowercase slug/);
});

test("an importer's own failure surfaces unchanged", async () => {
  const failing = importerReturning([], [], { import: async () => { throw new Error("source is down"); } });
  await assert.rejects(runImporter(failing, context({})), /source is down/);
});

test("the example importer turns a feed into drafts and notes what it skips", async () => {
  const result = await runImporter(exampleImporter, context({ [EXAMPLE_FEED_URL]: JSON.stringify(feed) }));
  assert.deepEqual(result.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.deadline ?? null]), [
    ["npm.package.acme-widget.deprecated", "vers:npm/<2.0.0", "deprecated", null],
    ["npm.package.zeta.eol", "vers:npm/*", "end-of-life", "2024-01-31"],
  ]);
  assert.deepEqual(result.notes, ['Skipped mystery: unknown status "sunsetting".']);
  assert.deepEqual(registryV2Issues({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: result.rules }), []);
  assert.equal(result.rules[0]!["x-npm"]?.package, "acme-widget");
});

test("a response that is not JSON is reported with its URL", async () => {
  await assert.rejects(runImporter(exampleImporter, context({ [EXAMPLE_FEED_URL]: "<html>" })), /not valid JSON/);
});

test("the live context reads successful responses, retries server errors, and names failures", async (t) => {
  let flaky = 0;
  const server = createServer((request, response) => {
    if (request.url === "/ok") return void response.writeHead(200).end("hello");
    if (request.url === "/flaky") return void response.writeHead(++flaky === 1 ? 502 : 200).end("recovered");
    if (request.url === "/missing") return void response.writeHead(404).end("no");
    if (request.url === "/slow") return;
    response.writeHead(400).end();
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const live = liveContext(NOW, 200);

  assert.equal(await live.fetchText(`${base}/ok`), "hello");
  assert.equal(await live.fetchText(`${base}/flaky`), "recovered");
  await assert.rejects(live.fetchText(`${base}/missing`), new RegExp(`GET ${base.replace(/[.]/g, "\\.")}/missing failed: HTTP 404`));
  await assert.rejects(live.fetchText(`${base}/slow`), /failed/);
  assert.equal(live.now, NOW);
});

test("the command line lists importers and explains mistakes", async () => {
  const script = resolve("dist/tools/importers/run.js");
  const { stdout } = await run(process.execPath, [script, "--list"]);
  assert.ok(stdout.length > 0);
  await assert.rejects(run(process.execPath, [script]), /Usage: run <importer-id>/);
  await assert.rejects(run(process.execPath, [script, "nonexistent"]), /Unknown importer "nonexistent"/);
  await assert.rejects(run(process.execPath, [script, "--now", "yesterday", "x"]), /--now must be a date|Unknown importer/);
});

test("no bundled rule is waiting for review", async () => {
  for (const name of (await readdir(resolve("registry"))).filter((file) => file.endsWith(".json") && !file.startsWith("sources."))) {
    const registry = JSON.parse(await readFile(resolve("registry", name), "utf8")) as {
      schemaVersion?: string;
      rules?: { id: string; provenance: { reviewer: string } }[];
    };
    if (registry.schemaVersion !== "evergreen.registry.v2") continue;
    for (const rule of registry.rules ?? []) assert.notEqual(rule.provenance.reviewer, PENDING_REVIEWER, `${name}: ${rule.id}`);
  }
});

test("npm test runs tests in subdirectories without skipping the rest", async () => {
  const { scripts } = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { scripts: Record<string, string> };
  // An unquoted ** is expanded by the shell, which would silently run only subdirectory tests.
  assert.match(scripts.test!, /node --test "dist\/tests\/\*\*\/\*\.test\.js"/);
});
