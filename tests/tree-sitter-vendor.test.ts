import assert from "node:assert/strict";
import dns from "node:dns";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import type { SourceUsageContract } from "../src/domain.js";
import { decodePayload, sha256, verifyVendor } from "../tools/verify-tree-sitter-wasm.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function scratch(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
}

interface NetworkTrap {
  calls: string[];
  restore(): void;
}

/** Refuses every socket, resolver, and fetch attempt while a scan runs. */
function trapNetwork(): NetworkTrap {
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

test("the committed payloads match the manifest and no wasm binary is committed", async () => {
  const { manifest, problems } = await verifyVendor();
  assert.deepEqual(problems, []);
  assert.equal(manifest.package, "@vscode/tree-sitter-wasm");
  assert.equal(manifest.version, "0.3.1");
  assert.equal(manifest.source, "https://registry.npmjs.org/@vscode/tree-sitter-wasm/-/tree-sitter-wasm-0.3.1.tgz");
  assert.equal(manifest.files.length, 5);

  const vendor = await readdir(resolve("src/usage/vendor/tree-sitter"));
  assert.deepEqual(vendor.filter((name) => name.endsWith(".wasm")), [], "wasm binaries must be stored as base64 text");
  for (const file of manifest.files) {
    const bytes = decodePayload(await readFile(resolve("src/usage/vendor/tree-sitter", file.file), "utf8"));
    assert.equal(bytes.byteLength, file.bytes, file.file);
    assert.equal(sha256(bytes), file.sha256, file.file);
  }
});

test("the checker reports a tampered payload and a stray wasm binary", async () => {
  const directory = join(await scratch("tree-sitter-vendor"), "vendor");
  await cp(resolve("src/usage/vendor/tree-sitter"), directory, { recursive: true });

  const payload = join(directory, "tree-sitter-python.wasm.b64");
  const encoded = await readFile(payload, "utf8");
  await writeFile(payload, encoded.replace(/[A-Za-z0-9+/]/, (character) => (character === "A" ? "B" : "A")));
  await writeFile(join(directory, "tree-sitter-cpp.wasm"), "");

  const { problems } = await verifyVendor(directory);
  assert.ok(problems.some((problem) => problem.startsWith("tree-sitter-python.wasm.b64: sha256")), problems.join("\n"));
  assert.ok(problems.some((problem) => problem.startsWith("tree-sitter-cpp.wasm: committed WebAssembly binary")), problems.join("\n"));
});

test("an installed package scans source usage offline from the base64 payloads", async () => {
  const root = await scratch("tree-sitter-package");
  const packageDirectory = join(root, "node_modules", "evergreen-deprecation");
  await mkdir(join(packageDirectory, "dist"), { recursive: true });
  await cp(resolve("dist/src"), join(packageDirectory, "dist", "src"), { recursive: true });
  await writeFile(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: "evergreen-deprecation", version: "0.0.0", type: "module" }),
  );

  // An installed package ships the base64 payloads only; drop any stale build output before importing.
  const vendor = join(packageDirectory, "dist", "src", "usage", "vendor", "tree-sitter");
  for (const name of await readdir(vendor)) if (name.endsWith(".wasm")) await rm(join(vendor, name));

  const project = join(root, "project");
  await writeFiles(project, {
    "src/client.ts": 'import legacyRequest from "request";\nlegacyRequest.get("https://example.com");\n',
    "src/worker.js": 'const request = require("request");\nrequest.post("/");\n',
    "app.py": "import nose\nnose.run()\n",
  });

  const contracts: SourceUsageContract[] = [
    {
      id: "request",
      matchers: [
        { kind: "import", language: "typescript", module: "request" },
        { kind: "call", language: "typescript", module: "request", targets: ["default", "get", "post"] },
        { kind: "import", language: "javascript", module: "request" },
        { kind: "call", language: "javascript", module: "request", targets: ["default", "get", "post"] },
      ],
    },
    {
      id: "nose",
      matchers: [
        { kind: "import", language: "python", module: "nose" },
        { kind: "call", language: "python", module: "nose", targets: ["run"] },
      ],
    },
  ];

  const installed = (path: string) => import(pathToFileURL(join(packageDirectory, "dist", "src", path)).href);
  const trap = trapNetwork();
  try {
    const { analyzeSourceUsage } = (await installed("source-usage.js")) as typeof import("../src/source-usage.js");
    const analyses = await analyzeSourceUsage(project, contracts);
    assert.deepEqual(
      analyses.map((analysis) => [analysis.contractId, analysis.usages.length]),
      [
        ["request", 4],
        ["nose", 2],
      ],
    );

    // The installed payload really parses; a failed load would have fallen back to the regex scanner.
    const { parseSource } = (await installed("usage/tree-sitter.js")) as typeof import("../src/usage/tree-sitter.js");
    const tree = await parseSource("typescript", "const x: number = 1;\n");
    assert.ok(tree);
    try {
      assert.equal(tree.rootNode.hasError, false);
      assert.match(tree.rootNode.toString(), /lexical_declaration/);
    } finally {
      tree.delete();
    }
  } finally {
    trap.restore();
  }
  assert.deepEqual(trap.calls, []);
});
