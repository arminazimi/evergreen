// Builds the lifecycle data bundle from registry/.
//
//   npm run build --silent
//   node dist/tools/build-data-bundle.js --created-at 2026-10-16T09:30:00Z --out dist/data/bundle.json
//
// The build is deterministic: the same registry files and the same --created-at give the same bytes. It never reads
// a clock; the release workflow passes the release commit's date. Prints the version and content digest.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildDataBundle, serializeDataBundle, sha256Hex } from "../src/data-bundle.js";

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv: string[]): Promise<void> {
  const createdAt = option(argv, "--created-at");
  if (!createdAt) throw new Error("--created-at is required, for example 2026-10-16T09:30:00Z (the release commit's date).");
  const revision = option(argv, "--revision");
  const root = resolve(option(argv, "--root") ?? ".");
  const packageVersion = (JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { version: string }).version;

  const bundle = await buildDataBundle({
    root,
    createdAt,
    ...(revision ? { revision: Number(revision) } : {}),
    minimumEvergreenVersion: option(argv, "--minimum-version") ?? packageVersion,
  });
  const text = serializeDataBundle(bundle);
  const out = option(argv, "--out");
  if (out) {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(resolve(out), text);
  } else {
    process.stdout.write(text);
  }
  process.stderr.write(`data bundle ${bundle.manifest.version}: ${bundle.manifest.contentDigest}, file sha256:${sha256Hex(text)}${out ? `, wrote ${resolve(out)}` : ""}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
