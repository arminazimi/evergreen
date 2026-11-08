// Checks and extends the hash-chained log of data releases (docs/DATA.md, "Release log").
//
//   node dist/tools/data-release-log.js check <log.jsonl> [--previous <older-log.jsonl>]
//   node dist/tools/data-release-log.js append <log.jsonl> --bundle <bundle.json> --out <new-log.jsonl>
//
// `check` exits 1 when an entry was changed, removed, or reordered, or (with --previous) when the log is not an
// extension of an older copy. `append` reads the bundle's manifest and adds one entry; `<log.jsonl>` may not exist yet.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { sha256Hex } from "../src/data-bundle.js";
import { appendReleaseLog, extendsReleaseLog, verifyReleaseLog } from "../src/data-release-log.js";

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

function readManifest(bundleText: string): { version: string; createdAt: string; contentDigest: string } {
  const bundle: unknown = JSON.parse(bundleText);
  const raw = bundle !== null && typeof bundle === "object" && "manifest" in bundle ? bundle.manifest : undefined;
  const manifest = new Map<string, unknown>(raw !== null && typeof raw === "object" ? Object.entries(raw) : []);
  const version = manifest.get("version");
  const createdAt = manifest.get("createdAt");
  const contentDigest = manifest.get("contentDigest");
  if (typeof version !== "string" || typeof createdAt !== "string" || typeof contentDigest !== "string")
    throw new Error("The bundle has no manifest with a version, createdAt, and contentDigest.");
  return { version, createdAt, contentDigest };
}

export async function main(argv: string[]): Promise<void> {
  const [command, logPath] = argv;
  if (!logPath || (command !== "check" && command !== "append"))
    throw new Error("Usage: data-release-log.js check|append <log.jsonl> [options]");

  if (command === "check") {
    const text = await readFile(resolve(logPath), "utf8");
    const entries = verifyReleaseLog(text);
    const previous = option(argv, "--previous");
    if (previous && !extendsReleaseLog(await readFile(resolve(previous), "utf8"), text))
      throw new Error(`${logPath} does not extend ${previous}: a past release was changed or removed.`);
    process.stdout.write(
      `release log ok: ${entries.length} entries${entries.length ? `, head ${entries.at(-1)!.hash}` : ""}\n`,
    );
    return;
  }

  const bundlePath = option(argv, "--bundle");
  const out = option(argv, "--out");
  if (!bundlePath || !out) throw new Error("append needs --bundle and --out.");
  const bundleText = await readFile(resolve(bundlePath), "utf8");
  const manifest = readManifest(bundleText);
  const next = appendReleaseLog(await readOptional(logPath), {
    version: manifest.version,
    contentDigest: manifest.contentDigest,
    createdAt: manifest.createdAt,
    bundleSha256: `sha256:${sha256Hex(bundleText)}`,
  });
  await writeFile(resolve(out), next);
  process.stdout.write(`release log: added ${manifest.version}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
