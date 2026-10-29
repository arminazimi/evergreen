import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  ISSUE_MARKER,
  ISSUE_TITLE,
  LISTINGS,
  checkListing,
  checkListings,
  ensureStaleIssue,
  escapeMarkdownTableCell,
  extractDockerServerYaml,
  extractHtmlSemver,
  extractOfficialRegistryLatest,
  findOpenStaleIssue,
  main,
  parseArguments,
  readExpectedVersion,
  renderStaleIssueBody,
  renderSummary,
  sameListingLocation,
  type IssueClient,
  type Listing,
  type TextFetcher,
} from "../tools/check-mcp-listings.js";

const EXPECTED = "0.7.1";

const listing = (overrides: Partial<Listing> & Pick<Listing, "id" | "check">): Listing => ({
  name: overrides.name ?? overrides.id,
  url: overrides.url ?? `https://example.com/${overrides.id}`,
  update: overrides.update ?? "test",
  account: overrides.account ?? "test",
  checkUrl: overrides.checkUrl ?? `https://example.com/check/${overrides.id}`,
  ...overrides,
});

test("readExpectedVersion requires a consistent server.json version", () => {
  assert.equal(readExpectedVersion(JSON.stringify({ version: "1.2.3", packages: [{ version: "1.2.3" }] })), "1.2.3");
  assert.throws(() => readExpectedVersion("{}"), /no version string/);
  assert.throws(
    () => readExpectedVersion(JSON.stringify({ version: "1.0.0", packages: [{ version: "2.0.0" }] })),
    /does not match/,
  );
});

test("extractors read versions from registry JSON, HTML, and Docker YAML", () => {
  assert.equal(extractOfficialRegistryLatest(JSON.stringify({ server: { version: "0.7.1" } })), "0.7.1");
  assert.equal(extractOfficialRegistryLatest("{"), null);
  assert.equal(extractHtmlSemver(`Evergreen ${EXPECTED} local MCP`, EXPECTED), EXPECTED);
  assert.equal(extractHtmlSemver("version 9.9.9 on the page", EXPECTED), "9.9.9");
  assert.equal(extractHtmlSemver("no version here", EXPECTED), null);
  assert.equal(extractDockerServerYaml("name: evergreen\nversion: 0.7.1\n"), "0.7.1");
  assert.equal(extractDockerServerYaml("image: mcp/evergreen:0.6.0\n"), "0.6.0");
  assert.equal(extractDockerServerYaml("name: evergreen\n"), null);
});

test("checkListing reports current, stale, not-listed, unreachable, and skipped", async () => {
  const fetchText: TextFetcher = async (url) => {
    if (url.includes("registry-latest")) {
      return { status: 200, text: JSON.stringify({ server: { version: EXPECTED } }) };
    }
    if (url.includes("stale")) {
      return { status: 200, text: JSON.stringify({ server: { version: "0.1.0" } }) };
    }
    if (url.includes("missing")) return { status: 404, text: "not found" };
    if (url.includes("boom")) return { status: null, text: "", error: "network down" };
    return { status: 200, text: "ok" };
  };

  assert.equal(
    (await checkListing(listing({ id: "ok", check: "official-registry-latest", checkUrl: "https://example.com/registry-latest" }), EXPECTED, fetchText)).status,
    "current",
  );
  assert.equal(
    (await checkListing(listing({ id: "old", check: "official-registry-latest", checkUrl: "https://example.com/stale" }), EXPECTED, fetchText)).status,
    "stale",
  );
  assert.equal(
    (await checkListing(listing({ id: "gone", check: "html-semver", checkUrl: "https://example.com/missing" }), EXPECTED, fetchText)).status,
    "not-listed",
  );
  assert.equal(
    (await checkListing(listing({ id: "down", check: "html-semver", checkUrl: "https://example.com/boom" }), EXPECTED, fetchText)).status,
    "unreachable",
  );
  assert.equal((await checkListing(listing({ id: "skip", check: "skip" }), EXPECTED, fetchText)).status, "skipped");
  assert.equal(
    (await checkListing(listing({ id: "gh", check: "http-ok", checkUrl: "https://example.com/missing" }), EXPECTED, fetchText)).status,
    "not-listed",
  );
  assert.equal(
    (await checkListing(listing({ id: "gh-ok", check: "http-ok", checkUrl: "https://example.com/present" }), EXPECTED, fetchText)).status,
    "current",
  );
});

test("checkListings collects stale rows and renderSummary names them", async () => {
  const report = await checkListings({
    expectedVersion: EXPECTED,
    listings: [
      listing({ id: "ok", check: "official-registry-latest", checkUrl: "https://example.com/ok" }),
      listing({ id: "old", name: "Old Directory", check: "official-registry-latest", checkUrl: "https://example.com/old" }),
      listing({ id: "later", check: "skip" }),
    ],
    fetchText: async (url) =>
      url.endsWith("/ok")
        ? { status: 200, text: JSON.stringify({ server: { version: EXPECTED } }) }
        : { status: 200, text: JSON.stringify({ server: { version: "0.0.1" } }) },
    now: new Date("2026-10-30T00:00:00Z"),
  });
  assert.equal(report.stale.length, 1);
  assert.equal(report.stale[0]?.id, "old");
  const summary = renderSummary(report);
  assert.match(summary, /Expected version/);
  assert.match(summary, /Old Directory/);
  assert.match(summary, /Stale listings/);
  assert.match(renderStaleIssueBody(report), new RegExp(ISSUE_MARKER));
  assert.match(renderStaleIssueBody(report), /0\.0\.1/);
});

test("ensureStaleIssue opens one issue and updates an existing open marker issue", async () => {
  const report = await checkListings({
    expectedVersion: EXPECTED,
    listings: [listing({ id: "old", check: "official-registry-latest", checkUrl: "https://example.com/old" })],
    fetchText: async () => ({ status: 200, text: JSON.stringify({ server: { version: "0.0.1" } }) }),
  });

  const created: IssueClient = {
    listOpenIssues: async () => [],
    createIssue: async (_repo, title, body) => {
      assert.equal(title, ISSUE_TITLE);
      assert.match(body, new RegExp(ISSUE_MARKER));
      return { number: 42, title, body, state: "open", html_url: "https://github.com/arminazimi/evergreen/issues/42" };
    },
    updateIssue: async () => {
      throw new Error("should not update");
    },
  };
  assert.deepEqual((await ensureStaleIssue(report, "arminazimi/evergreen", created)).action, "created");

  let updatedBody = "";
  const updated: IssueClient = {
    listOpenIssues: async () => [{ number: 7, title: "other", body: `hello ${ISSUE_MARKER}`, state: "open" }],
    createIssue: async () => {
      throw new Error("should not create");
    },
    updateIssue: async (_repo, number, body) => {
      assert.equal(number, 7);
      updatedBody = body;
      return { number: 7, title: ISSUE_TITLE, body, state: "open" };
    },
  };
  assert.equal((await ensureStaleIssue(report, "arminazimi/evergreen", updated)).action, "updated");
  assert.match(updatedBody, /0\.0\.1/);

  const clean = await checkListings({
    expectedVersion: EXPECTED,
    listings: [listing({ id: "ok", check: "skip" })],
    fetchText: async () => ({ status: 200, text: "" }),
  });
  assert.equal((await ensureStaleIssue(clean, "arminazimi/evergreen", created)).action, "none");
  assert.equal(findOpenStaleIssue([{ number: 1, title: ISSUE_TITLE, state: "open" }])?.number, 1);
});

test("parseArguments and main write a report without touching the network", async () => {
  assert.equal(parseArguments([]).serverPath.endsWith("server.json"), true);
  assert.equal(parseArguments(["--open-issue", "--repo", "o/r"]).openIssue, true);
  assert.throws(() => parseArguments(["--out"]), /needs a value/);
  assert.throws(() => parseArguments(["nope"]), /Unexpected/);

  const directory = await mkdtemp(join(tmpdir(), "mcp-listings-"));
  const serverPath = join(directory, "server.json");
  const outPath = join(directory, "report.json");
  const summaryPath = join(directory, "summary.md");
  await writeFile(serverPath, JSON.stringify({ version: EXPECTED, packages: [{ version: EXPECTED }] }));
  try {
    const code = await main(["--server", serverPath, "--out", outPath, "--summary", summaryPath, "--open-issue", "--repo", "arminazimi/evergreen"], {
      fetchText: async (url) => {
        if (url.includes("versions/latest")) {
          return { status: 200, text: JSON.stringify({ server: { version: EXPECTED } }) };
        }
        if (url.includes("github.com/mcp/")) return { status: 404, text: "missing" };
        if (url.includes("docker/mcp-registry")) return { status: 404, text: "missing" };
        if (url.includes("glama.ai")) return { status: 404, text: "missing" };
        return { status: 404, text: "missing" };
      },
      issueClient: {
        listOpenIssues: async () => [],
        createIssue: async () => {
          throw new Error("no stale issue expected");
        },
        updateIssue: async () => {
          throw new Error("no stale issue expected");
        },
      },
    });
    assert.equal(code, 0);
    const report = JSON.parse(await readFile(outPath, "utf8")) as { expectedVersion: string; stale: unknown[] };
    assert.equal(report.expectedVersion, EXPECTED);
    assert.equal(report.stale.length, 0);
    assert.match(await readFile(summaryPath, "utf8"), /MCP directory listings/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("docs/MCP_LISTINGS.md names every catalog directory", async () => {
  const doc = await readFile(resolve("docs/MCP_LISTINGS.md"), "utf8");
  for (const entry of LISTINGS) {
    assert.ok(doc.includes(entry.name), `docs/MCP_LISTINGS.md must name ${entry.name}`);
    assert.ok(doc.includes(entry.url), `docs/MCP_LISTINGS.md must include ${entry.url}`);
  }
});

test("sameListingLocation compares host and path without regex host matching", () => {
  const official = "https://registry.modelcontextprotocol.io/v0/servers?search=evergreen";
  assert.equal(sameListingLocation(official, official), true);
  assert.equal(
    sameListingLocation("https://registry.modelcontextprotocol.io/v0/servers?search=other", official),
    true,
  );
  assert.equal(
    sameListingLocation("https://registry.modelcontextprotocolXio/v0/servers?search=evergreen", official),
    false,
  );
  assert.equal(sameListingLocation("https://hub.docker.com/mcp", "https://hub.docker.com/mcp"), true);
  assert.equal(sameListingLocation("https://hub.dockerXcom/mcp", "https://hub.docker.com/mcp"), false);
  assert.equal(sameListingLocation("https://www.pulsemcp.com/", "https://www.pulsemcp.com"), true);
  assert.equal(sameListingLocation("not a url", official), false);
});

test("escapeMarkdownTableCell escapes backslash before pipe", () => {
  assert.equal(escapeMarkdownTableCell("a|b"), "a\\|b");
  assert.equal(escapeMarkdownTableCell("a\\b"), "a\\\\b");
  assert.equal(escapeMarkdownTableCell("a\\|b"), "a\\\\\\|b");
});

test("main returns 1 when a listing is stale", async () => {
  const code = await main(["--server", "server.json"], {
    fetchText: async (url) => {
      if (url.includes("versions/latest")) {
        return { status: 200, text: JSON.stringify({ server: { version: "0.0.1" } }) };
      }
      return { status: 404, text: "missing" };
    },
    readFile: async () => JSON.stringify({ version: EXPECTED }),
  });
  assert.equal(code, 1);
});
