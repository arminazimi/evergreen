// Shared helpers for the tools that call npm itself: the reproducible-build check and the release manifest.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

/**
 * npm is not a dependency of this package, so it cannot be required. `npm_execpath` points at npm's own CLI
 * whenever npm runs this script; otherwise the npm installed beside Node is used (the layout of the official
 * installers and of actions/setup-node).
 */
export function npmCli(): string {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv !== undefined && fromEnv.endsWith("npm-cli.js") && existsSync(fromEnv)) return fromEnv;
  const besideNode =
    process.platform === "win32"
      ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
      : join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return besideNode;
}

/** Runs a command and returns its stdout, rejecting on a non-zero exit. */
export function capture(command: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], cwd === undefined ? {} : { cwd });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise(output);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${signal ?? code}`));
    });
  });
}
