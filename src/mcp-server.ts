import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createEvergreenMcpServer } from "./mcp.js";

/** Serves Evergreen's MCP tools, resources, and prompt over stdio until the host closes the connection. */
export function startMcpServer(): void {
  serveStdio(() => createEvergreenMcpServer(), {
    onerror(error) {
      process.stderr.write(`Evergreen MCP error: ${error.message}\n`);
    },
  });
}
