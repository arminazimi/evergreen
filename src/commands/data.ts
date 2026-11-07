import { spawnSync } from "node:child_process";
import http from "node:http";
import process from "node:process";

import { DataUpdateError, renderDataUpdateText, updateData } from "../data-update.js";
import { getDataStatus, renderDataStatusText } from "../data-status.js";
import { isOfflineDataUpdateFailure, offlineDataUpdate } from "../errors.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

/**
 * `data update` is the one command that uses the network, and it must honor the standard proxy variables. Node does
 * that for `fetch` only when started with NODE_USE_ENV_PROXY, so when a proxy is configured the command runs again
 * in a child process that has it (Node 22.21 and later). Returns that child's exit code, or undefined to carry on.
 */
function relaunchWithEnvironmentProxy(): number | undefined {
  const proxied = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"].some((name) => process.env[name]);
  if (!proxied || process.env.NODE_USE_ENV_PROXY) return undefined;
  if (typeof http.setGlobalProxyFromEnv === "function") return undefined;
  if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
    process.stderr.write(
      "A proxy is configured, but this Node.js cannot use it for downloads. Use Node.js 22.21 or newer.\n",
    );
    return undefined;
  }
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  return child.status ?? 1;
}

export const command: CliCommand = {
  name: "data",
  flags: ["--json", "--data-version"],
  example: "evergreen data status",
  usage: ["  evergreen data status [--json]", "  evergreen data update [--data-version <version>] [--json]"],
  usageSlots: [42, 59],
  completion: { subcommands: ["status", "update"], extraWords: ["--json", "--data-version"] },
  run(args, ctx) {
    return afterGates("data", args, ctx, async (state) => {
      const subcommand = state.args[1];
      if (subcommand === "update") {
        const relaunched = relaunchWithEnvironmentProxy();
        if (relaunched !== undefined) return relaunched;
        try {
          const result = await updateData(state.dataVersionFlag ? { version: state.dataVersionFlag } : {});
          process.stdout.write(`${state.json ? JSON.stringify(result, null, 2) : renderDataUpdateText(result)}\n`);
          return 0;
        } catch (error) {
          if (error instanceof DataUpdateError) {
            return isOfflineDataUpdateFailure(error.message)
              ? ctx.failActionable("data", offlineDataUpdate(error.message))
              : ctx.failError(error);
          }
          throw error;
        }
      }
      if (subcommand !== "status")
        return ctx.fail("usage", `Unknown data command: ${subcommand ?? ""}`, `\n${ctx.help}`);
      const status = await getDataStatus();
      process.stdout.write(`${state.json ? JSON.stringify(status, null, 2) : renderDataStatusText(status)}\n`);
      return 0;
    });
  },
};
