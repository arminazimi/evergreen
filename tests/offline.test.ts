import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import dns from "node:dns";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { after, afterEach, test } from "node:test";
import { promisify } from "node:util";

import { EvergreenAgentTools } from "../src/agent-tools.js";
import { checkDependency } from "../src/check-dependency.js";
import { buildDataBundle, serializeDataBundle } from "../src/data-bundle.js";
import { verifyArtifactSignature } from "../src/data-signature.js";
import { ACTIVE_FILE, BUNDLE_FILE, cachedBundleDirectory, configureActiveData, SIGNATURE_FILE } from "../src/data-source.js";
import { getDataStatus } from "../src/data-status.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
afterEach(() => configureActiveData());

const scratch = async (name: string) => {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
};

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : [])));
  return nested.flat();
}

const NETWORK_USE = /node:(?:https?|net|tls|dns|dgram|http2)\b|from ["'](?:https?|net|tls|dns|dgram|http2)["']|\bfetch\(|undici|WebSocket|XMLHttpRequest/;

test("only the update command, the CLI entry point, and the Action's GitHub API calls can reach the network in the source tree", async () => {
  const using: string[] = [];
  for (const file of await sourceFiles(resolve("src"))) if (NETWORK_USE.test(await readFile(file, "utf8"))) using.push(relative(process.cwd(), file).replaceAll("\\", "/"));
  assert.deepEqual(using.sort(), ["src/action-tracking-issue.ts", "src/cli-main.ts", "src/data-update.ts", "src/pr-comment.ts"]);
  // The CLI only imports `http` to configure proxy support inside the update command.
  const cli = await readFile(resolve("src/cli-main.ts"), "utf8");
  assert.equal((cli.match(/fetch\(/g) ?? []).length, 0);
  assert.match(cli, /relaunchWithEnvironmentProxy/);
});

test("the signature verification libraries contain no network code", async () => {
  for (const name of ["verify", "bundle", "core", "protobuf-specs"]) {
    const directory = resolve("node_modules/@sigstore", name, "dist");
    const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith(".js"));
    assert.ok(files.length > 0, name);
    for (const file of files) {
      const text = await readFile(join(directory, file), "utf8");
      assert.doesNotMatch(text, /require\(["'](?:node:)?(?:https?|net|tls|dns|dgram|http2)["']\)|\bfetch\(/, `@sigstore/${name}/${file}`);
    }
  }
});

interface Trap {
  calls: string[];
  restore(): void;
}

/** Records, and refuses, every attempt to open a socket, resolve a name, or call fetch. */
function trapNetwork(): Trap {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  const originalLookup = dns.lookup;
  const refuse = (what: string) => {
    calls.push(what);
    throw new Error(`Network access during a scan: ${what}`);
  };
  globalThis.fetch = ((input: unknown) => refuse(`fetch ${String(input)}`)) as never;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    return refuse(`socket connect ${JSON.stringify(args[0])}`);
  } as never;
  (dns as { lookup: unknown }).lookup = (host: string) => refuse(`dns lookup ${host}`);
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      net.Socket.prototype.connect = originalConnect;
      (dns as { lookup: unknown }).lookup = originalLookup;
    },
  };
}

async function projectWithEverything(): Promise<string> {
  const project = await scratch("project");
  await mkdir(join(project, ".github", "workflows"), { recursive: true });
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo", engines: { node: "18" }, dependencies: { request: "^2.88.2" } }));
  await writeFile(join(project, "requirements.txt"), "nose==1.3.7\n");
  await writeFile(join(project, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n      - uses: actions/setup-python@v4\n");
  return project;
}

/** A cache holding a bundle that cannot verify (a placeholder signature), so loading it exercises verification too. */
async function cacheWithUnverifiableBundle(): Promise<string> {
  const root = await scratch("registry");
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const bundle = await buildDataBundle({ root, createdAt: "2999-01-01T00:00:00Z", minimumEvergreenVersion: "0.1.0" });
  const cache = await scratch("cache");
  await mkdir(cachedBundleDirectory(cache, "2999.01.01"), { recursive: true });
  await writeFile(join(cachedBundleDirectory(cache, "2999.01.01"), BUNDLE_FILE), serializeDataBundle(bundle));
  await writeFile(join(cachedBundleDirectory(cache, "2999.01.01"), SIGNATURE_FILE), "{}");
  await writeFile(join(cache, "data", ACTIVE_FILE), JSON.stringify({ version: "2999.01.01" }));
  return cache;
}

test("the trap really catches network use", async () => {
  const trap = trapNetwork();
  try {
    await assert.rejects(Promise.resolve().then(() => fetch("http://127.0.0.1:9/")), /Network access during a scan/);
    assert.throws(() => net.connect(9, "127.0.0.1"), /Network access during a scan/);
    assert.throws(() => dns.lookup("example.com", () => undefined), /Network access during a scan/);
  } finally {
    trap.restore();
  }
  assert.equal(trap.calls.length, 3);
});

test("scans, checks, MCP-style tools, status, and signature verification make no network call, even with a cache present", async () => {
  const project = await projectWithEverything();
  const cache = await cacheWithUnverifiableBundle();
  configureActiveData({ cacheDirectory: cache });
  const trap = trapNetwork();
  try {
    const result = await scanRepository(project, builtInDetectors);
    assert.ok(result.findings.length >= 4, "the scan really found things");
    assert.match(result.diagnostics.join("\n"), /Ignoring downloaded lifecycle data 2999\.01\.01/, "the cache was loaded and verified");

    assert.equal((await checkDependency("pkg:npm/request@2.88.2")).status, "affected");
    const tools = new EvergreenAgentTools();
    const list = await tools.list(project);
    assert.ok(list.count > 0);
    await tools.context(list.deprecations[0]!.id, project);
    assert.equal((await getDataStatus()).source, "bundled");

    const artifact = await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt"));
    const signature = await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt.sigstore.json"), "utf8");
    assert.equal(verifyArtifactSignature(artifact, signature, { issuer: "https://accounts.google.com", identityPattern: "^keyless@projectsigstore\\.iam\\.gserviceaccount\\.com$" }).issuer, "https://accounts.google.com");
  } finally {
    trap.restore();
  }
  assert.deepEqual(trap.calls, []);
});

test("every command except data update is offline when run as a real process with a cache present", async () => {
  const project = await projectWithEverything();
  const cache = await cacheWithUnverifiableBundle();
  const logDirectory = await scratch("log");
  const log = join(logDirectory, "network.log");
  const preload = join(logDirectory, "trap.cjs");
  await writeFile(
    preload,
    `const fs = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");
const record = (what) => fs.appendFileSync(${JSON.stringify(log)}, what + "\\n");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { record("connect " + JSON.stringify(args[0])); return connect.apply(this, args); };
const lookup = dns.lookup;
dns.lookup = function (host, ...rest) { record("lookup " + host); return lookup.call(this, host, ...rest); };
const fetchFn = globalThis.fetch;
globalThis.fetch = function (input, ...rest) { record("fetch " + input); return fetchFn.call(this, input, ...rest); };
`,
  );
  const run = async (args: string[], extra: Record<string, string> = {}) => {
    await writeFile(log, "");
    try {
      await execute(process.execPath, [resolve("dist/src/cli.js"), ...args], { env: { ...process.env, EVERGREEN_DATA_DIR: cache, NODE_OPTIONS: `--require ${preload}`, ...extra } });
    } catch {
      // Exit codes do not matter here; only what the process tried to reach does.
    }
    return (await readFile(log, "utf8")).split("\n").filter(Boolean);
  };

  const findingId = (JSON.parse((await execute(process.execPath, [resolve("dist/src/cli.js"), "scan", project, "--json"], { env: { ...process.env, EVERGREEN_DATA_DIR: cache } }).catch((error: { stdout: string }) => error)).stdout) as { findings: Array<{ id: string }> }).findings[0]!.id;
  for (const args of [
    ["scan", project, "--json"],
    ["scan", project, "--format", "sarif"],
    ["scan", project, "--format", "rdjson"],
    ["check", "pkg:npm/request@2.88.2"],
    ["explain", findingId, project],
    ["context", findingId, project],
    ["baseline", project, "--output", join(logDirectory, "baseline.json")],
    ["doctor", project],
    ["capabilities", "--json"],
    ["data", "status"],
  ]) assert.deepEqual(await run(args), [], `evergreen ${args[0]} reached the network`);

  const update = await run(["data", "update"], { EVERGREEN_DATA_URL: "http://127.0.0.1:9/releases" });
  assert.ok(update.some((entry) => entry.startsWith("fetch ") || entry.startsWith("connect ")), `data update is the one command that uses the network: ${update.join(", ")}`);
});
