#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { startLanguageServer } from "./lsp/server.js";

export {
  DIAGNOSTIC_SOURCE,
  EXPLAIN_FINDING_COMMAND,
  LANGUAGE_SERVER_NAME,
  OPEN_EVIDENCE_COMMAND,
  readFramedMessages,
  writeFramedMessage,
} from "./lsp/protocol.js";
export { EvergreenLanguageServer, startLanguageServer } from "./lsp/server.js";
export type { LanguageServerOptions, StartLanguageServerOptions } from "./lsp/server.js";

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(entry))).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) startLanguageServer();
