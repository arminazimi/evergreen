// Verifies that the package is reproducible: two clean builds of the same commit pack to
// byte-identical npm tarballs, so anyone can rebuild a published version from its source
// and compare the hashes.
//
//   node dist/tools/reproducible-build.js
//
// Each iteration wipes dist, rebuilds, and packs with `npm pack --ignore-scripts` (prepack
// would run the whole check, which the caller already did). npm normalizes the tar metadata
// (uid, gid, and mtimes), so the bytes depend on the shipped file contents only; a mismatch
// means a build step writes something nondeterministic. On a mismatch the two tarballs are
// kept in a temporary directory, named in the error, for unpacking and diffing. The default
// build also removes the committed dist/action bundle, so it is restored from git afterwards.
//
// The release workflow runs this check on every release; a mismatch fails it.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * npm is not a dependency of this package, so it cannot be required. `npm_execpath` points at
 * npm's own CLI whenever npm runs this script; otherwise the npm installed beside Node is used
 * (the layout of the official installers and of actions/setup-node).
 */
function npmCli(): string {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv !== undefined && fromEnv.endsWith("npm-cli.js") && existsSync(fromEnv)) return fromEnv;
  const besideNode =
    process.platform === "win32"
      ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
      : join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return besideNode;
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export interface ReproducibleBuildOptions {
  /** One clean build of the package. Defaults to wiping dist and running `npm run build`. */
  build?: () => Promise<void>;
  /** Pack the package into the destination directory and return the tarball file name. Defaults to `npm pack --ignore-scripts`. */
  pack?: (destination: string) => Promise<string>;
  /** How many clean builds to compare. Two is enough: a deterministic build gives the same bytes every time. */
  builds?: number;
}

export interface ReproducibleBuildResult {
  /** SHA-256 of each packed tarball, in build order. */
  hashes: readonly string[];
}

export function runCommand(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${signal ?? code}`));
    });
  });
}

function capture(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args]);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk;
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

async function cleanBuild(run: CommandRunner): Promise<void> {
  await rm("dist", { recursive: true, force: true });
  await run(process.execPath, [npmCli(), "run", "build", "--silent"]);
}

async function packTarball(run: CommandRunner, destination: string): Promise<string> {
  const output = await capture(process.execPath, [npmCli(), "pack", "--ignore-scripts", "--json", "--pack-destination", destination]);
  const parsed = JSON.parse(output) as Array<{ filename?: string }>;
  const filename = parsed[0]?.filename;
  if (!filename) throw new Error(`npm pack did not report a tarball file name: ${output.trim()}`);
  return filename;
}

/**
 * `npm run build` writes only dist/src; the committed dist/action bundle is outside it, and tests that
 * spawn the Action expect the file. `git checkout` puts it back after a build wiped it.
 */
async function restoreActionBundle(run: CommandRunner): Promise<void> {
  try {
    const status = await capture("git", ["status", "--porcelain", "--", "dist/action"]);
    if (status.trim() !== "") await run("git", ["checkout", "--", "dist/action"]);
  } catch {
    // Not a git checkout; nothing to restore from.
  }
}

export async function compareCleanBuilds(options: ReproducibleBuildOptions = {}): Promise<ReproducibleBuildResult> {
  const run: CommandRunner = runCommand;
  const build = options.build ?? (() => cleanBuild(run));
  const pack = options.pack ?? ((destination: string) => packTarball(run, destination));
  const count = options.builds ?? 2;
  const directory = await mkdtemp(join(tmpdir(), "evergreen-reproducible-"));
  const hashes: string[] = [];
  const tarballs: string[] = [];

  let failure: unknown;
  try {
    for (let iteration = 0; iteration < count; iteration += 1) {
      await build();
      const tarball = join(directory, await pack(directory));
      tarballs.push(tarball);
      hashes.push(createHash("sha256").update(await readFile(tarball)).digest("hex"));
    }
  } catch (error) {
    failure = error;
  }

  const reproducible = failure === undefined && new Set(hashes).size === 1;
  if (reproducible) await rm(directory, { recursive: true, force: true });
  await restoreActionBundle(run);

  if (failure !== undefined) {
    throw failure instanceof Error ? failure : new Error(String(failure));
  }
  if (!reproducible) {
    const details = hashes.map((hash, index) => `  build ${index + 1}: sha256 ${hash} (${tarballs[index]})`).join("\n");
    throw new Error(`the builds are not reproducible: the packed tarballs differ\n${details}\nThe tarballs were kept in ${directory}; unpack both and diff them to find the file that changed.`);
  }
  return { hashes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { hashes } = await compareCleanBuilds();
    console.log(`Two clean builds pack to byte-identical tarballs: sha256 ${hashes[0]}`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
