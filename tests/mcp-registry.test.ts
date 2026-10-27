import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Ajv } from "ajv";

const execute = promisify(execFile);
const read = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8")) as Record<string, unknown>;

const server = (await read("server.json")) as {
  name: string;
  title: string;
  description: string;
  version: string;
  repository: { url: string; source: string };
  packages: Array<{ registryType: string; registryBaseUrl: string; identifier: string; version: string; runtimeHint: string; transport: { type: string }; packageArguments: Array<{ type: string; value: string }> }>;
};
const manifest = (await read("package.json")) as { name: string; version: string; mcpName: string; bin: Record<string, string>; repository: { url: string } };

test("server.json validates against the official MCP Registry schema", async () => {
  const schema = await read("schemas/vendor/mcp-server-2025-12-11.json");
  assert.equal(server["$schema" as never] as string, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(server), true, JSON.stringify(validate.errors));
  assert.ok(server.description.length <= 100 && server.title.length <= 100);
});

test("the vendored schema is the published file", async () => {
  const bytes = await readFile(resolve("schemas/vendor/mcp-server-2025-12-11.json"));
  assert.ok((await readFile(resolve("schemas/vendor/README.md"), "utf8")).includes(createHash("sha256").update(bytes).digest("hex")));
});

test("the registry can prove the npm package belongs to this server", () => {
  assert.equal(manifest.mcpName, server.name, "package.json mcpName must equal the server name, or the registry refuses the package");
  assert.match(server.name, /^io\.github\.arminazimi\/[a-z0-9._-]+$/, "a GitHub namespace the owner can authenticate");
  const [pkg] = server.packages;
  assert.equal(server.packages.length, 1);
  assert.deepEqual([pkg!.registryType, pkg!.registryBaseUrl, pkg!.identifier], ["npm", "https://registry.npmjs.org", manifest.name]);
  assert.equal(pkg!.version, manifest.version);
  assert.equal(server.version, manifest.version, "bump server.json and package.json together");
  assert.equal(server.repository.url, "https://github.com/arminazimi/evergreen");
  assert.equal(server.repository.source, "github");
});

test("the way the registry starts the server really starts it", async () => {
  const [pkg] = server.packages;
  // npx runs the bin named like the package; a package with several bins and none of that name cannot be run by name.
  assert.equal(pkg!.runtimeHint, "npx");
  assert.ok(manifest.bin[manifest.name], `package.json needs a bin named ${manifest.name} so \`npx ${manifest.name}\` works`);
  assert.deepEqual(pkg!.packageArguments, [{ type: "positional", value: "mcp" }]);
  assert.equal(pkg!.transport.type, "stdio");

  // Run exactly that command line against the built CLI and speak MCP to it.
  const child = execute(process.execPath, [resolve("dist/src/cli.js"), "mcp"], { timeout: 15_000, killSignal: "SIGKILL" });
  child.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "registry-check", version: "1" } } })}\n`);
  const output = await new Promise<string>((done) => {
    let buffer = "";
    child.child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes("\n")) {
        child.child.kill("SIGKILL");
        done(buffer);
      }
    });
    child.catch(() => done(buffer));
  });
  const reply = JSON.parse(output.split("\n")[0]!) as { result: { serverInfo: { name: string } } };
  assert.equal(reply.result.serverInfo.name, "evergreen");
});
