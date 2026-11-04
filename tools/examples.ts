// Materializes an example repository so it can be read by scanners and detectors.
//
// Files a dependency scanner reads by name are committed under the decision 0027 names (`.fixture`, with
// `image` standing in for `Dockerfile`). This tool copies one example to a temporary directory, restores the
// real names there, and either prints the directory or runs an Evergreen command inside it. Nothing is
// written to the repository.
//
//   node dist/tools/examples.js <example> [command ...]
//
//   node dist/tools/examples.js gallery/kubernetes scan
//   node dist/tools/examples.js gallery countdown --as-of 2026-10-25
//   node dist/tools/examples.js drift/java drift --runtime java
//   node dist/tools/examples.js codemods/dockerfile-legacy fix
//
// With no command it prints the temporary directory and leaves it in place for another command.

import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { restoreFixtureNames } from "../src/fixture-names.js";

const EXAMPLES = resolve("examples");

/**
 * Copies the example named relative to `examples/` into a temporary directory and restores the real file
 * names scanners must not see in the repository. Returns the directory the example now occupies.
 */
export async function materializeExample(name: string): Promise<string> {
  if (isAbsolute(name)) throw new Error(`\`${name}\` is not an example under ${EXAMPLES}`);
  const relativeName = name.replace(/^examples[\\/]/u, "");
  const source = resolve(EXAMPLES, relativeName);
  if (source === EXAMPLES || !source.startsWith(`${EXAMPLES}${sep}`)) {
    throw new Error(`\`${name}\` is not an example under ${EXAMPLES}`);
  }
  const directory = await mkdtemp(join(tmpdir(), "evergreen-example-"));
  const materialized = join(directory, basename(source));
  await cp(source, materialized, { recursive: true });
  await restoreFixtureNames(materialized);
  return materialized;
}

function runCli(directory: string, args: readonly string[]): Promise<number> {
  const cli = resolve("dist", "src", "cli.js");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: directory, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolvePromise(code ?? (signal === null ? 1 : 0)));
  });
}

async function main(args: readonly string[]): Promise<void> {
  const [name, ...command] = args;
  if (name === undefined) {
    process.stderr.write(
      "Usage: node dist/tools/examples.js <example> [evergreen command ...]\n\n" +
        "Example: node dist/tools/examples.js gallery/kubernetes scan\n",
    );
    process.exitCode = 2;
    return;
  }
  const directory = await materializeExample(name);
  if (command.length === 0) {
    process.stdout.write(`${directory}\n`);
    return;
  }
  try {
    process.exitCode = await runCli(directory, command);
  } finally {
    await rm(dirname(directory), { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
