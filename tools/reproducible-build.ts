// Verifies that the package is reproducible: two clean builds of the same commit pack to
// byte-identical npm tarballs, so anyone can rebuild a published version from its source
// and compare the hashes.
//
//   node dist/tools/reproducible-build.js
//   node dist/tools/reproducible-build.js --record <file> [--label <name>]
//
// Each iteration wipes dist, rebuilds, and packs with `npm pack --ignore-scripts` (prepack
// would run the whole check, which the caller already did). npm normalizes the tar metadata
// (uid, gid, and mtimes), so the bytes depend on the shipped file contents only; a mismatch
// means a build step writes something nondeterministic. On a mismatch the two tarballs are
// kept in a temporary directory, named in the error, for unpacking and diffing. The default
// build also removes the committed dist/action bundle, so it is restored from git afterwards.
//
// `--record` is the other half of the check: it packs the tree the caller already built and
// writes a small JSON record with the tarball hash. CI runs it on Linux, Windows, and macOS and
// `tools/compare-build-hashes.mjs` fails unless every runner packed the same bytes. Two builds on
// one machine cannot catch a host-dependent step; another runner can.
//
// The release workflow runs the local check on every release and the PR and merge-queue lanes run
// the cross-runner comparison; either mismatch fails it.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReleaseManifestFromPackList } from "./build-release-manifest.js";
import { capture, npmCli } from "./npm-cli.js";

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

/** One runner's packed tarball, written by `--record` and compared by `tools/compare-build-hashes.mjs`. */
export interface BuildHashRecord {
  /** Where the build ran, for the comparison message. CI passes the runner's OS. */
  label: string;
  /** SHA-256 of the packed tarball. */
  sha256: string;
  /** Node.js version that ran the build. */
  node: string;
  platform: NodeJS.Platform;
  tarball: string;
}

export interface RecordHashOptions {
  label?: string;
  /** Pack the current tree into the destination and return the tarball file name. Defaults to npm pack. */
  pack?: (destination: string) => Promise<string>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

async function cleanBuild(run: CommandRunner): Promise<void> {
  await rm("dist", { recursive: true, force: true });
  await run(process.execPath, [npmCli(), "run", "build", "--silent"]);
}

async function packTarball(_run: CommandRunner, destination: string): Promise<string> {
  const output = await capture(process.execPath, [
    npmCli(),
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    destination,
  ]);
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
  // The manifest is part of the published tarball, so it is generated before each pack and must be deterministic too.
  const pack =
    options.pack ??
    (async (destination: string) => {
      await writeReleaseManifestFromPackList(process.cwd());
      return packTarball(run, destination);
    });
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
      hashes.push(sha256(await readFile(tarball)));
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
    throw new Error(
      `the builds are not reproducible: the packed tarballs differ\n${details}\nThe tarballs were kept in ${directory}; unpack both and diff them to find the file that changed.`,
    );
  }
  return { hashes };
}

/**
 * Packs the tree the caller already built and records its tarball hash, for comparing builds made on
 * different runners. The release manifest is written first, exactly as `prepack` does, so the bytes
 * are what a publish from this tree would ship: run `npm run build` before calling it.
 */
export async function recordPackedHash(options: RecordHashOptions = {}): Promise<BuildHashRecord> {
  const pack =
    options.pack ??
    (async (destination: string) => {
      await writeReleaseManifestFromPackList(process.cwd());
      return packTarball(runCommand, destination);
    });
  const directory = await mkdtemp(join(tmpdir(), "evergreen-build-hash-"));
  try {
    const tarball = await pack(directory);
    return {
      label: options.label ?? process.platform,
      sha256: sha256(await readFile(join(directory, tarball))),
      node: process.version,
      platform: process.platform,
      tarball,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The value after a `--flag` argument, or undefined when the flag is absent. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const recordPath = flagValue(args, "--record");
    if (recordPath === undefined) {
      const { hashes } = await compareCleanBuilds();
      console.log(`Two clean builds pack to byte-identical tarballs: sha256 ${hashes[0]}`);
    } else {
      const record = await recordPackedHash({ label: flagValue(args, "--label") ?? process.platform });
      const target = resolve(recordPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(record, null, 2)}\n`);
      console.log(`Recorded the build on ${record.label}: sha256 ${record.sha256} (${record.tarball})`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
