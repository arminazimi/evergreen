// Install the packed artifact against the same integrity-pinned dependency graph CI built.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const record = z.record(z.string(), z.unknown());
const packageSchema = z.looseObject({ name: z.string(), overrides: record.optional() });
const lockSchema = z.looseObject({
  name: z.string(),
  version: z.string(),
  lockfileVersion: z.literal(3),
  packages: z.record(z.string(), record),
});

export async function preparePackageSmoke(tarball: string, directory: string, root = process.cwd()): Promise<void> {
  const source = packageSchema.parse(JSON.parse(await readFile(join(root, "package.json"), "utf8")));
  const lock = lockSchema.parse(JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")));
  const original = lock.packages[""];
  if (original === undefined) {
    throw new Error("Package smoke requires the project's named package and version-3 lockfile");
  }
  // npm file specs use filesystem paths. A file URL percent-encodes Windows short-path tildes,
  // which npm treats as literal characters instead of decoding them.
  const archivePath = relative(resolve(directory), resolve(tarball)).replaceAll("\\", "/");
  const archive = `file:${archivePath}`;
  const manifest = {
    name: "evergreen-package-smoke",
    version: "0.0.0",
    private: true,
    dependencies: { [source.name]: archive },
    ...(source.overrides === undefined ? {} : { overrides: source.overrides }),
  };
  const installed: Record<string, unknown> = {
    ...original,
    resolved: archive,
    integrity: `sha512-${createHash("sha512")
      .update(await readFile(tarball))
      .digest("base64")}`,
  };
  delete installed.devDependencies;
  lock.name = manifest.name;
  lock.version = manifest.version;
  lock.packages[""] = manifest;
  lock.packages[`node_modules/${source.name}`] = installed;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(directory, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [tarball, directory] = process.argv.slice(2);
  if (!tarball || !directory) throw new Error("Usage: prepare-package-smoke <tarball> <install-directory>");
  await preparePackageSmoke(tarball, directory);
}
