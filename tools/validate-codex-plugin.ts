import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

interface McpConfiguration {
  mcpServers: Record<string, {
    type: "stdio";
    command: string;
    args?: string[];
  }>;
}

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

async function main(): Promise<void> {
  const pluginRoot = resolve(argument("--plugin-root", "plugins/codex"));
  const configuration = JSON.parse(
    await readFile(resolve(pluginRoot, "mcp.json"), "utf8"),
  ) as McpConfiguration;
  const server = configuration.mcpServers.evergreen;
  if (!server || server.type !== "stdio") {
    throw new Error("The installed Evergreen stdio MCP server is missing");
  }

  const fixture = await mkdtemp(join(tmpdir(), "evergreen-codex-plugin-"));
  const workflows = join(fixture, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  const workflow = join(workflows, "ci.yml");
  await writeFile(
    workflow,
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );

  const child = spawn(server.command, server.args ?? [], {
    cwd: pluginRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, (response: RpcResponse) => void>();
  let nextId = 1;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  lines.on("line", (line) => {
    const response = JSON.parse(line) as RpcResponse;
    pending.get(response.id)?.(response);
  });

  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId++;
    const response = new Promise<RpcResponse>((resolveResponse, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${method}${stderr ? `: ${stderr}` : ""}`)),
        30_000,
      );
      pending.set(id, (value) => {
        clearTimeout(timeout);
        resolveResponse(value);
      });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? `${method} failed`);
    return received.result ?? {};
  };

  try {
    await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "evergreen-codex-plugin-validator", version: "1.0.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    const scan = await request("tools/call", {
      name: "scan_repository",
      arguments: { repository_path: fixture },
    });
    const finding = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0];
    if (!finding) throw new Error("Installed plugin scan returned no fixture finding");

    const explanation = await request("tools/call", {
      name: "explain_deprecation",
      arguments: { finding_id: finding.id, repository_path: fixture },
    });
    if ((explanation.structuredContent as { id?: string }).id !== finding.id) {
      throw new Error("Installed plugin explanation did not match the scanned finding");
    }

    const context = await request("tools/call", {
      name: "create_migration_context",
      arguments: { finding_id: finding.id, repository_path: fixture },
    });
    if ((context.structuredContent as { schemaVersion?: string }).schemaVersion !== "evergreen.context.v1") {
      throw new Error("Installed plugin returned invalid migration context");
    }

    await writeFile(
      workflow,
      "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v7\n",
    );
    const verification = await request("tools/call", {
      name: "verify_migration",
      arguments: { finding_id: finding.id, repository_path: fixture },
    });
    const result = verification.structuredContent as {
      verified?: boolean;
      commandsExecuted?: boolean;
    };
    if (result.verified !== true || result.commandsExecuted !== false) {
      throw new Error("Installed plugin verification did not resolve safely");
    }

    process.stdout.write(
      `${JSON.stringify({ pluginRoot, completedSteps: ["scan", "explain", "context", "verify"], verified: true, commandsExecuted: false }, null, 2)}\n`,
    );
  } finally {
    child.stdin.end();
    lines.close();
    child.kill();
    await rm(fixture, { recursive: true, force: true });
  }
}

await main();
