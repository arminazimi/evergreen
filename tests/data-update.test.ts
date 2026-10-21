import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, afterEach, test } from "node:test";
import { promisify } from "node:util";

import { buildDataBundle, serializeDataBundle } from "../src/data-bundle.js";
import type { DataBundle } from "../src/data-bundle.js";
import { configureActiveData, resolveActiveData } from "../src/data-source.js";
import { compareBundleVersions, DataUpdateError, latestDataRelease, renderDataUpdateText, updateData } from "../src/data-update.js";
import { VERSION } from "../src/version.js";

const execute = promisify(execFile);
const roots: string[] = [];
const servers: http.Server[] = [];
const signer = { identity: "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/tags/data-v2999.01.01", issuer: "https://token.actions.githubusercontent.com" };
const accepting = { verifySignature: () => signer };

after(async () => {
  await Promise.all(servers.map((server) => new Promise((done) => { server.close(done); server.closeAllConnections(); })));
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
afterEach(() => configureActiveData());

const scratch = async (name: string) => {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
};

async function bundleAt(createdAt: string, revision = 1, mutate: (npm: { rules: Array<Record<string, unknown>> }) => void = () => undefined): Promise<DataBundle> {
  const root = await scratch("registry");
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const npm = JSON.parse(await readFile(join(root, "registry/npm.json"), "utf8")) as { rules: Array<Record<string, unknown>> };
  mutate(npm);
  await writeFile(join(root, "registry/npm.json"), JSON.stringify(npm));
  return buildDataBundle({ root, createdAt, revision, minimumEvergreenVersion: "0.1.0" });
}

/** Gives each bundle its own content, since bundles with identical data share a content address and are not "newer". */
const stamped = (stamp: string) => (npm: { rules: Array<Record<string, unknown>> }) => {
  npm.rules[0]!.summary = `${String(npm.rules[0]!.summary)} [${stamp}]`;
};

const extraRule = (npm: { rules: Array<Record<string, unknown>> }) => npm.rules.push({ ...structuredClone(npm.rules[0]!), id: "npm.package.extra.test-only", purl: "pkg:npm/extra", "x-npm": { package: "extra" } });

interface Published {
  version: string;
  bundle: DataBundle;
  bytes?: string;
  signature?: string;
  withoutSignature?: boolean;
  draft?: boolean;
  tag?: string;
}

interface Fixture {
  url: string;
  requests: string[];
  publish(...releases: Published[]): void;
  respond(path: string, status: number, body?: string): void;
}

/** A local stand-in for the GitHub release list and asset downloads. */
async function fixtureServer(): Promise<Fixture> {
  let releases: Published[] = [];
  const overrides = new Map<string, { status: number; body: string }>();
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    requests.push(path);
    const override = overrides.get(path.split("?")[0]!);
    if (override) {
      response.writeHead(override.status).end(override.body);
      return;
    }
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (path.startsWith("/releases")) {
      const list = releases.map((release) => ({
        tag_name: release.tag ?? `data-v${release.version}`,
        draft: release.draft ?? false,
        assets: [
          { name: `evergreen-data-${release.version}.json`, browser_download_url: `${origin}/download/${release.version}/bundle` },
          ...(release.withoutSignature ? [] : [{ name: `evergreen-data-${release.version}.json.sigstore.json`, browser_download_url: `${origin}/download/${release.version}/signature` }]),
        ],
      }));
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(list));
      return;
    }
    const match = /^\/download\/([^/]+)\/(bundle|signature)$/.exec(path);
    const release = releases.find((item) => item.version === match?.[1]);
    if (!match || !release) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200).end(match[2] === "bundle" ? (release.bytes ?? serializeDataBundle(release.bundle)) : (release.signature ?? "{}"));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases`;
  return {
    url,
    requests,
    publish(...next) {
      releases = next;
    },
    respond(path, status, body = "") {
      overrides.set(path, { status, body });
    },
  };
}

const publishNewest = async (fixture: Fixture, createdAt = "2999-01-01T00:00:00Z", mutate?: Parameters<typeof bundleAt>[2]) => {
  const bundle = await bundleAt(createdAt, 1, mutate);
  fixture.publish({ version: bundle.manifest.version, bundle });
  return bundle;
};

test("an update downloads, verifies, stores, and activates the newest bundle", async () => {
  const fixture = await fixtureServer();
  const bundle = await publishNewest(fixture, "2999.01.01".replaceAll(".", "-") + "T00:00:00Z", extraRule);
  const cache = await scratch("cache");
  const result = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });

  assert.equal(result.status, "updated");
  assert.deepEqual([result.from.source, result.to.source, result.to.version], ["bundled", "cache", "2999.01.01"]);
  assert.equal(result.contentDigest, bundle.manifest.contentDigest);
  assert.deepEqual(result.signer, signer);
  assert.deepEqual(result.rules.npm!.after - result.rules.npm!.before!, 1);
  assert.match(renderDataUpdateText(result), new RegExp(`Updated lifecycle data: ${VERSION.replace(/\./g, '\\.')} \\(bundled\\) → 2999\.01\.01 \\(cache\\)\\.\nRules: npm: \\d+ → \\d+ rules\\.`));

  assert.deepEqual((await readdir(join(cache, "data"))).sort(), ["2999.01.01", "active.json"]);
  assert.equal(JSON.parse(await readFile(join(cache, "data", "active.json"), "utf8")).version, "2999.01.01");
  const active = await resolveActiveData({ cacheDirectory: cache, ...accepting });
  assert.equal(active.info.source, "cache");
  assert.ok(((await active.read("registry/npm.json")) as { rules: Array<{ id: string }> }).rules.some((rule) => rule.id === "npm.package.extra.test-only"));
});

test("a new version with identical data is not an update, because the content address is the same", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  const first = await bundleAt("2999-01-01T00:00:00Z");
  fixture.publish({ version: first.manifest.version, bundle: first });
  await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  const sameData = await bundleAt("2999-02-01T00:00:00Z");
  assert.equal(sameData.manifest.contentDigest, first.manifest.contentDigest);
  fixture.publish({ version: sameData.manifest.version, bundle: sameData });
  const result = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  assert.equal(result.status, "up-to-date");
  assert.equal(result.to.version, "2999.01.01");
});

test("running it again changes nothing and says so", async () => {
  const fixture = await fixtureServer();
  await publishNewest(fixture);
  const cache = await scratch("cache");
  await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  const again = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  assert.equal(again.status, "up-to-date");
  assert.equal(again.to.version, "2999.01.01");
  assert.match(renderDataUpdateText(again), /^Lifecycle data is up to date: 2999\.01\.01\./);
});

test("the newest data release wins, and drafts, other tags, and incomplete releases are ignored", async () => {
  assert.ok(compareBundleVersions("2026.10.16.2", "2026.10.16") > 0);
  assert.ok(compareBundleVersions("2026.10.16.10", "2026.10.16.9") > 0);
  assert.ok(compareBundleVersions("2026.11.01", "2026.10.31.9") > 0);
  assert.equal(compareBundleVersions("2026.10.16", "2026.10.16"), 0);
  const assets = (version: string) => [
    { name: `evergreen-data-${version}.json`, browser_download_url: `https://example.com/${version}.json` },
    { name: `evergreen-data-${version}.json.sigstore.json`, browser_download_url: `https://example.com/${version}.sig` },
  ];
  const latest = latestDataRelease([
    { tag_name: "v0.2.0", assets: assets("0.2.0") },
    { tag_name: "data-v2026.10.01", assets: assets("2026.10.01") },
    { tag_name: "data-v2026.10.20", draft: true, assets: assets("2026.10.20") },
    { tag_name: "data-v2026.10.18", assets: assets("2026.10.18").slice(0, 1) },
    { tag_name: "data-v2026.10.16.2", assets: assets("2026.10.16.2") },
    { tag_name: "data-v2026.10.16", assets: assets("2026.10.16") },
    { tag_name: "data-v2026.10.16-evil", assets: assets("2026.10.16-evil") },
  ]);
  assert.equal(latest?.version, "2026.10.16.2");
  assert.equal(latest?.bundleUrl, "https://example.com/2026.10.16.2.json");
  assert.equal(latestDataRelease([]), undefined);
});

test("a download that does not verify is refused and the previous data stays active", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  const first = await bundleAt("2998-01-01T00:00:00Z");
  fixture.publish({ version: first.manifest.version, bundle: first });
  await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  const before = await readFile(join(cache, "data", "active.json"), "utf8");

  const second = await bundleAt("2999-01-01T00:00:00Z");
  const tampered = structuredClone(second);
  (tampered.files["registry/npm.json"]!.rules as Array<{ summary: string }>)[0]!.summary = "Safe to use.";
  fixture.publish({ version: second.manifest.version, bundle: second, bytes: serializeDataBundle(tampered) });
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting }), /Refusing data bundle 2999\.01\.01: registry\/npm\.json does not match its digest\./);
  const failing = { verifySignature: () => { throw new (class extends Error { constructor() { super("The signature did not verify: bad"); this.name = "DataSignatureError"; } })(); } };
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...failing }), /did not verify|bad/);

  assert.equal(await readFile(join(cache, "data", "active.json"), "utf8"), before, "the pointer did not move");
  assert.deepEqual((await readdir(join(cache, "data"))).sort(), ["2998.01.01", "active.json"], "nothing from the refused bundle was stored");
});

test("with the real signature check, an unsigned or foreign signature is refused and nothing is stored", async () => {
  const fixture = await fixtureServer();
  const bundle = await bundleAt("2999-01-01T00:00:00Z");
  const foreign = await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt.sigstore.json"), "utf8");
  const cache = await scratch("cache");
  for (const signature of ["{}", "garbage", foreign]) {
    fixture.publish({ version: bundle.manifest.version, bundle, signature });
    await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url }), /Refusing data bundle 2999\.01\.01: The signature/);
  }
  await assert.rejects(readdir(join(cache, "data")), /ENOENT/);

  fixture.publish({ version: bundle.manifest.version, bundle, signature: foreign });
  const result = await execute(process.execPath, [resolve("dist/src/cli.js"), "data", "update"], { env: { ...process.env, EVERGREEN_DATA_DIR: cache, EVERGREEN_DATA_URL: fixture.url } }).catch((error: { code: number; stderr: string }) => error);
  assert.equal((result as { code: number }).code, 1);
  assert.match((result as { stderr: string }).stderr, /Refusing data bundle 2999\.01\.01: The signature/);
});

test("an older bundle is refused as a rollback unless the user allows it", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  const newer = await bundleAt("2999-06-01T00:00:00Z", 1, stamped("june"));
  fixture.publish({ version: newer.manifest.version, bundle: newer });
  await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });

  const older = await bundleAt("2999-01-01T00:00:00Z", 1, stamped("january"));
  fixture.publish({ version: older.manifest.version, bundle: older });
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting }), /older than the active data 2999\.06\.01/);
  const allowed = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, allowDowngrade: true, ...accepting });
  assert.equal(allowed.to.version, "2999.01.01");
});

test("data that the installed release already beats is not downloaded into use", async () => {
  const fixture = await fixtureServer();
  const bundled = await resolveActiveData({ cacheDirectory: await scratch("cache"), ...accepting });
  const old = await bundleAt(`${bundled.info.reviewedThrough}T00:00:00Z`);
  fixture.publish({ version: old.manifest.version, bundle: old });
  const cache = await scratch("cache");
  const result = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  assert.equal(result.status, "up-to-date");
  await assert.rejects(readdir(join(cache, "data")), /ENOENT/);
});

test("only the three newest bundles are kept", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  for (const day of ["01", "02", "03", "04"]) {
    const bundle = await bundleAt(`2999-01-${day}T00:00:00Z`, 1, stamped(day));
    fixture.publish({ version: bundle.manifest.version, bundle });
    await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  }
  assert.deepEqual((await readdir(join(cache, "data"))).sort(), ["2999.01.02", "2999.01.03", "2999.01.04", "active.json"]);
});

test("network problems and bad responses give clear errors and change nothing", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  const run = (extra: Record<string, unknown> = {}) => updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting, ...extra } as never);

  fixture.publish();
  await assert.rejects(run(), /No signed data release was found/);
  fixture.respond("/releases", 500);
  await assert.rejects(run(), /Could not download the release list: HTTP 500/);
  fixture.respond("/releases", 200, "not json");
  await assert.rejects(run(), /release list is not valid JSON/);
  fixture.respond("/releases", 200, "{}");
  await assert.rejects(run(), /release list is not valid JSON/);

  const bundle = await bundleAt("2999-01-01T00:00:00Z");
  fixture.respond("/releases", 404);
  await assert.rejects(run({ releasesUrl: "http://127.0.0.1:1/releases" }), /Could not download the release list/);
  fixture.publish({ version: bundle.manifest.version, bundle, withoutSignature: true });
  fixture.respond("/releases", 200, JSON.stringify([{ tag_name: "data-v2999.01.01", assets: [{ name: "evergreen-data-2999.01.01.json", browser_download_url: `${fixture.url.replace("/releases", "")}/download/2999.01.01/bundle` }] }]));
  await assert.rejects(run(), /No signed data release was found/);
  await assert.rejects(readdir(join(cache, "data")), /ENOENT/);
});

test("downloads are bounded and must use https (plain http only for localhost)", async () => {
  const cache = await scratch("cache");
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: "http://example.com/releases", ...accepting }), /must use https/);
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: "ftp://example.com/releases", ...accepting }), /must use https/);
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: "not a url", ...accepting }), /not a valid URL/);

  const oversized = async () => new Response("x".repeat(100), { headers: { "content-length": String(50 * 1024 * 1024) } });
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: "https://example.com/releases", fetch: oversized as never, ...accepting }), /larger than the/);
  const hostile = async (input: string | URL | Request) =>
    String(input).endsWith("/releases")
      ? new Response(JSON.stringify([{ tag_name: "data-v2999.01.01", assets: [{ name: "evergreen-data-2999.01.01.json", browser_download_url: "http://evil.example/b" }, { name: "evergreen-data-2999.01.01.json.sigstore.json", browser_download_url: "https://example.com/s" }] }]))
      : new Response("{}");
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: "https://example.com/releases", fetch: hostile as never, ...accepting }), /must use https/);
});

test("a bundle whose signed version differs from its release is refused", async () => {
  const fixture = await fixtureServer();
  const bundle = await bundleAt("2999-01-01T00:00:00Z");
  fixture.publish({ version: "2999.01.02", bundle });
  await assert.rejects(updateData({ cacheDirectory: await scratch("cache"), releasesUrl: fixture.url, ...accepting }), /signed bundle says it is version 2999\.01\.01/);
});

for (const [name, withoutHelper] of [
  ["where Node can set the proxy itself", false],
  ["on a Node without setGlobalProxyFromEnv, by running again with NODE_USE_ENV_PROXY", true],
] as const) {
  test(`the CLI update goes through an HTTP proxy when one is configured, ${name}`, async () => {
    const fixture = await fixtureServer();
    const proxied: string[] = [];
    // A real proxy answers both forms: absolute-URI requests (newer Node) and CONNECT tunnels (Node 22 tunnels even http).
    const proxy = http.createServer((request, response) => {
      proxied.push(`request ${request.url ?? ""}`);
      const target = new URL(request.url ?? "");
      const forward = http.request({ host: target.hostname, port: target.port, path: target.pathname + target.search, method: request.method }, (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(response);
      });
      request.pipe(forward);
    });
    proxy.on("connect", (request, clientSocket, head) => {
      proxied.push(`connect ${request.url ?? ""}`);
      const [host, port] = (request.url ?? "").split(":");
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
    });
    await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
    servers.push(proxy);
    const bundle = await bundleAt("2999-01-01T00:00:00Z");
    fixture.publish({ version: bundle.manifest.version, bundle, signature: "{}" });
    const cache = await scratch("cache");
    const preload = join(await scratch("preload"), "no-helper.cjs");
    await writeFile(preload, "delete require('node:http').setGlobalProxyFromEnv;\n");
    // Drop every inherited proxy variable (both cases, since Node prefers lowercase): a developer's no_proxy
    // would otherwise bypass the test proxy on 127.0.0.1.
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(https?|all|no)_proxy$/i.test(name)));
    const env = {
      ...inherited,
      EVERGREEN_DATA_DIR: cache,
      EVERGREEN_DATA_URL: fixture.url,
      HTTP_PROXY: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
      NO_PROXY: "",
      ...(withoutHelper ? { NODE_OPTIONS: `--require ${preload}` } : {}),
    };
    delete (env as Record<string, unknown>).NODE_USE_ENV_PROXY;
    const failure = await execute(process.execPath, [resolve("dist/src/cli.js"), "data", "update"], { env }).catch((error: { stderr: string; code: number }) => error);
    assert.equal((failure as { code: number }).code, 1);
    assert.match((failure as { stderr: string }).stderr, /Refusing data bundle 2999\.01\.01: The signature/, "the bundle was fetched, then refused for lack of a signature");
    assert.ok(proxied.length > 0, "the traffic went through the proxy");
    const fixturePort = new URL(fixture.url).port;
    assert.ok(proxied.every((entry) => entry.includes(`:${fixturePort}`)), `the proxy only carried traffic for the release server: ${proxied.join(", ")}`);
    assert.ok(proxied.some((entry) => entry.startsWith("connect ") || entry.includes("/releases")), "the release list was fetched through the proxy");
  });
}

test("downloading a specific version stores it for pinning without changing the active data", async () => {
  const fixture = await fixtureServer();
  const cache = await scratch("cache");
  const newest = await bundleAt("2999-06-01T00:00:00Z", 1, stamped("june"));
  const older = await bundleAt("2999-01-01T00:00:00Z", 1, stamped("january"));
  fixture.publish({ version: newest.manifest.version, bundle: newest }, { version: older.manifest.version, bundle: older });

  await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, ...accepting });
  assert.equal(JSON.parse(await readFile(join(cache, "data", "active.json"), "utf8")).version, "2999.06.01");

  const pinned = await updateData({ cacheDirectory: cache, releasesUrl: fixture.url, version: "2999.01.01", ...accepting });
  assert.equal(pinned.status, "downloaded");
  assert.equal(pinned.to.version, "2999.01.01");
  assert.match(renderDataUpdateText(pinned), /Downloaded lifecycle data 2999\.01\.01\. It is not active until you pin it: evergreen scan --data-version 2999\.01\.01/);
  assert.equal(JSON.parse(await readFile(join(cache, "data", "active.json"), "utf8")).version, "2999.06.01", "the pointer did not move");
  assert.deepEqual((await readdir(join(cache, "data"))).sort(), ["2999.01.01", "2999.06.01", "active.json"]);

  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url, version: "2999.03.03", ...accepting }), /No signed data release 2999\.03\.03 was found/);
  await assert.rejects(updateData({ cacheDirectory: cache, releasesUrl: fixture.url, version: "latest", ...accepting }), /not a data version/);
  fixture.publish({ version: older.manifest.version, bundle: older, signature: "{}" });
  await assert.rejects(updateData({ cacheDirectory: await scratch("cache"), releasesUrl: fixture.url, version: "2999.01.01" }), /Refusing data bundle 2999\.01\.01: The signature/);
});
