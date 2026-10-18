import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

import { isSafeForWindowsShell } from "./core/scan.js";

const MAX_BUFFER = 20 * 1024 * 1024;

const execFileAsync = promisify(execFile) as (
  file: string,
  args: readonly string[],
  options: { cwd: string; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface EvergreenOutput {
  stdout: string;
  stderr: string;
}

function isMissingExecutable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function runEvergreen(
  executable: string,
  args: string[],
  cwd: string,
): Promise<EvergreenOutput> {
  const options = { cwd, maxBuffer: MAX_BUFFER, windowsHide: true };
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, options);
    return { stdout, stderr };
  } catch (error) {
    if (!isMissingExecutable(error) || process.platform !== "win32") {
      throw error;
    }
    if (![executable, ...args].every(isSafeForWindowsShell)) {
      throw new Error(
        "The Evergreen command path contains characters that cannot be passed safely to the Windows shell.",
      );
    }
    const commandLine = [executable, ...args].map(quoteForCmd).join(" ");
    const { stdout, stderr } = await execFileAsync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", commandLine],
      options,
    );
    return { stdout, stderr };
  }
}
