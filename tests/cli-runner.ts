import process from "node:process";

import { run } from "../src/cli-main.js";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  /** Working directory for the invocation; the caller's directory is restored afterwards. */
  cwd?: string;
  /** Environment overrides on top of the current environment; `undefined` removes a variable. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs one CLI invocation through the same dispatch the executable uses (`src/cli-main.ts`), in this process,
 * and returns its exit code with the stdout and stderr it wrote.
 *
 * Spawning `node dist/src/cli.js` costs about 130 ms per call, nearly all of it module loading, which dominates
 * test files that assert output and exit codes across many invocations. Use this for those assertions, and keep
 * a real spawn where the process boundary itself is the contract (`tests/exit-codes.test.ts`).
 *
 * Capturing replaces the stream write methods for the duration of the call and records string writes. The test
 * runner sends its own events to stdout as `Buffer` chunks, so those are forwarded to the real stream untouched;
 * a command that writes `Buffer` output, or spawns a child that writes to the inherited descriptor, is not
 * captured, so the tests that assert on those spawn instead.
 */
export async function runCli(argv: readonly string[], options: CliOptions = {}): Promise<CliResult> {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  let stdout = "";
  let stderr = "";
  const capture =
    (stream: NodeJS.WriteStream, originalWrite: typeof process.stdout.write, append: (text: string) => void) =>
    (chunk: unknown, encodingOrCallback?: unknown, callback?: unknown): boolean => {
      if (typeof chunk !== "string") {
        return originalWrite.call(
          stream,
          chunk as Uint8Array,
          encodingOrCallback as BufferEncoding,
          callback as () => void,
        );
      }
      append(chunk);
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (typeof done === "function") (done as () => void)();
      return true;
    };

  process.stdout.write = capture(process.stdout, originalStdoutWrite, (text) => {
    stdout += text;
  }) as typeof process.stdout.write;
  process.stderr.write = capture(process.stderr, originalStderrWrite, (text) => {
    stderr += text;
  }) as typeof process.stderr.write;
  try {
    if (options.cwd !== undefined) process.chdir(options.cwd);
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = undefined;
    return { code: await run(argv), stdout, stderr };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
    process.exitCode = originalExitCode;
  }
}
