// Builds the data-only npm package under packages/data/ (or --out).
//
//   npm run build --silent
//   node dist/tools/build-data-package.js [--root DIR] [--out DIR] [--pack DIR]
//
// The package carries registry JSON and first-party schemas only: no scanner code, no nested
// package manifests, and nothing under schemas/vendor. Its version comes from the root
// package.json so the data module stays aligned with the release that produced it; its license
// is the dataset license, which is not the source code's. With --pack the tool runs
// `npm pack --ignore-scripts` into that directory and prints the tarball name.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DATA_PACKAGE_DIRECTORY = "packages/data";
export const DATA_PACKAGE_NAME = "evergreen-data";

/** Package-root documents that ship beside the data: the dataset license and its attribution notice. */
export const DATA_PACKAGE_DOCUMENTS = ["LICENSE", "ATTRIBUTION.md"] as const;

/** Paths that must never ship in the data-only tarball. */
const EXCLUDED_REGISTRY = new Set(["sources.lock.json"]);

const CODE_EXTENSIONS = /\.(?:js|mjs|cjs|ts|tsx|jsx|mts|cts|wasm|node|so|dll|exe|sh|bash|py|rb|go|rs)$/i;

interface RootPackage {
  version: string;
  repository?: { type?: string; url?: string };
  homepage?: string;
  bugs?: string | { url?: string };
}

export interface DataPackageJson {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  repository: { type: string; url: string; directory: string };
  homepage: string;
  bugs: string;
  license: string;
  files: string[];
  publishConfig: { access: string };
}

export interface BuiltDataPackage {
  /** Absolute path of the assembled package directory. */
  directory: string;
  /** Repository-relative paths of every file that will be packed (package.json, registry/*, schemas/*). */
  files: string[];
  packageJson: DataPackageJson;
}

export interface PackedFile {
  path: string;
  size: number;
  mode: number;
}

/**
 * npm is not a dependency of this package, so it cannot be required. `npm_execpath` points at
 * npm's own CLI whenever npm runs this script; otherwise the npm installed beside Node is used.
 */
export function npmCli(): string {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv !== undefined && fromEnv.endsWith("npm-cli.js") && existsSync(fromEnv)) return fromEnv;
  return process.platform === "win32"
    ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
}

function capture(command: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], { cwd });
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise(output);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${signal ?? code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function jsonNames(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
}

/** The package.json the data module publishes: metadata only, no main/bin/scripts/dependencies. */
export function dataPackageManifest(root: RootPackage, template: DataPackageJson): DataPackageJson {
  const repositoryUrl = root.repository?.url ?? template.repository.url;
  const bugs = typeof root.bugs === "string" ? root.bugs : (root.bugs?.url ?? template.bugs);
  return {
    name: DATA_PACKAGE_NAME,
    version: root.version,
    description: template.description,
    keywords: template.keywords,
    repository: { type: "git", url: repositoryUrl, directory: DATA_PACKAGE_DIRECTORY },
    homepage: root.homepage ?? template.homepage,
    bugs,
    license: template.license,
    files: ["registry", "schemas", "ATTRIBUTION.md"],
    publishConfig: { access: "public" },
  };
}

/**
 * Assembles a data-only package directory: package.json, the dataset license and attribution
 * notice, registry JSON (without the source lock), and first-party schemas (without schemas/vendor).
 */
export async function buildDataPackage(options: { root?: string; out?: string } = {}): Promise<BuiltDataPackage> {
  const root = resolve(options.root ?? ".");
  const directory = resolve(options.out ?? join(root, DATA_PACKAGE_DIRECTORY));
  const template = JSON.parse(await readFile(join(root, DATA_PACKAGE_DIRECTORY, "package.json"), "utf8")) as DataPackageJson;
  const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as RootPackage;
  const packageJson = dataPackageManifest(rootPackage, template);

  await mkdir(directory, { recursive: true });
  for (const name of ["registry", "schemas"]) {
    await rm(join(directory, name), { recursive: true, force: true });
  }

  const registryNames = (await jsonNames(join(root, "registry"))).filter((name) => !EXCLUDED_REGISTRY.has(name));
  const schemaNames = await jsonNames(join(root, "schemas"));
  await mkdir(join(directory, "registry"), { recursive: true });
  await mkdir(join(directory, "schemas"), { recursive: true });
  for (const name of registryNames) {
    await cp(join(root, "registry", name), join(directory, "registry", name));
  }
  for (const name of schemaNames) {
    await cp(join(root, "schemas", name), join(directory, "schemas", name));
  }
  for (const name of DATA_PACKAGE_DOCUMENTS) {
    // Reading first names a missing licence document; the destination is the source when the
    // package is assembled in place under packages/data.
    const source = join(root, DATA_PACKAGE_DIRECTORY, name);
    const contents = await readFile(source);
    if (join(directory, name) !== source) await writeFile(join(directory, name), contents);
  }
  await writeFile(join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  const files = [
    "package.json",
    ...DATA_PACKAGE_DOCUMENTS,
    ...registryNames.map((name) => `registry/${name}`),
    ...schemaNames.map((name) => `schemas/${name}`),
  ];
  return { directory, files, packageJson };
}

/** Packs the assembled directory with `npm pack --ignore-scripts` and returns the tarball file name. */
export async function packDataPackage(directory: string, destination: string): Promise<string> {
  await mkdir(destination, { recursive: true });
  const output = await capture(process.execPath, [npmCli(), "pack", "--ignore-scripts", "--json", "--pack-destination", destination], directory);
  const parsed = JSON.parse(output) as Array<{ filename?: string; files?: PackedFile[] }>;
  const filename = parsed[0]?.filename;
  if (!filename) throw new Error(`npm pack did not report a tarball file name: ${output.trim()}`);
  return filename;
}

/** Lists the packed file entries (paths relative to the package root) without extracting the archive. */
export async function listPackedFiles(directory: string): Promise<PackedFile[]> {
  const output = await capture(process.execPath, [npmCli(), "pack", "--dry-run", "--ignore-scripts", "--json"], directory);
  const parsed = JSON.parse(output) as Array<{ files?: PackedFile[] }>;
  const files = parsed[0]?.files;
  if (!files) throw new Error(`npm pack --dry-run did not report files: ${output.trim()}`);
  return files;
}

/**
 * Problems that mean the tarball is not data-only: executable bits, code extensions, nested
 * package.json manifests, anything outside registry/, schemas/, and the dataset's own license
 * documents (besides the root manifest), or a missing license document.
 */
export function tarballContentProblems(files: readonly PackedFile[]): string[] {
  const problems: string[] = [];
  const documents = new Set<string>(DATA_PACKAGE_DOCUMENTS);
  const manifests = files.filter((file) => /(^|\/)package\.json$/.test(file.path));
  if (manifests.length !== 1 || manifests[0]?.path !== "package.json") {
    problems.push(
      manifests.length === 0
        ? "missing package.json"
        : `nested or misplaced manifests: ${manifests.map((file) => file.path).sort().join(", ")}`,
    );
  }
  for (const name of DATA_PACKAGE_DOCUMENTS) {
    if (!files.some((file) => file.path === name)) problems.push(`missing ${name}`);
  }

  let registryCount = 0;
  let schemaCount = 0;
  for (const file of files) {
    const { path, mode } = file;
    if (path !== "package.json" && !documents.has(path) && !path.startsWith("registry/") && !path.startsWith("schemas/")) {
      problems.push(`unexpected path: ${path}`);
    }
    if (path.startsWith("registry/")) registryCount += 1;
    if (path.startsWith("schemas/")) schemaCount += 1;
    if (path.includes("/vendor/") || path.startsWith("vendor/")) problems.push(`vendor path: ${path}`);
    if (CODE_EXTENSIONS.test(path)) problems.push(`executable code: ${path}`);
    if (!path.endsWith(".json") && !documents.has(path)) problems.push(`non-json: ${path}`);
    if ((mode & 0o111) !== 0) problems.push(`executable mode: ${path} (${mode.toString(8)})`);
  }
  if (registryCount === 0) problems.push("missing registry JSON");
  if (schemaCount === 0) problems.push("missing schemas");
  return problems.sort();
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv: readonly string[] = process.argv.slice(2), cwd = "."): Promise<number> {
  const root = resolve(option(argv, "--root") ?? cwd);
  const out = option(argv, "--out");
  const built = await buildDataPackage({ root, ...(out ? { out: resolve(out) } : {}) });
  const packDestination = option(argv, "--pack");
  if (packDestination) {
    const destination = resolve(packDestination);
    const filename = await packDataPackage(built.directory, destination);
    const tarball = join(destination, filename);
    console.log(`Packed ${built.files.length} files into ${tarball}`);
  } else {
    console.log(`Wrote ${built.files.length} files under ${built.directory}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
