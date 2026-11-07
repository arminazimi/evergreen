// Rebuilds dependabot.json and dependabot.md from the committed raw records. Reads only committed
// files, and never the network.
//
//   node dist/benchmarks/comparison/dependabot/build.js          # rewrite both files
//   node dist/benchmarks/comparison/dependabot/build.js --check  # exit 1 when either committed file is stale

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildResult } from "./aggregate.js";
import { renderJson, renderMarkdown } from "./report.js";
import { RAW_SCHEMA_VERSION, type RawRecord } from "./types.js";

const DIR = "benchmarks/comparison/dependabot";

export async function loadRecords(dir: string): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  for (const file of (await readdir(join(dir, "raw"))).filter((name) => name.endsWith(".json")).sort()) {
    const record = JSON.parse(await readFile(join(dir, "raw", file), "utf8")) as RawRecord;
    if (record.schemaVersion !== RAW_SCHEMA_VERSION) throw new Error(`${file}: unexpected schemaVersion`);
    records.push(record);
  }
  return records;
}

export async function main(argv: string[], root = process.cwd()): Promise<number> {
  const dir = resolve(root, DIR);
  const result = buildResult(await loadRecords(dir));
  const files: Array<[string, string]> = [
    [join(dir, "dependabot.json"), renderJson(result)],
    [join(dir, "dependabot.md"), `${renderMarkdown(result)}\n`],
  ];
  if (!argv.includes("--check")) {
    for (const [path, contents] of files) await writeFile(path, contents);
    process.stdout.write(
      `comparison: ${result.groups.reduce((sum, group) => sum + group.repositories, 0)} repositories\n`,
    );
    return 0;
  }
  const stale: string[] = [];
  for (const [path, contents] of files) {
    if ((await readFile(path, "utf8").catch(() => undefined)) !== contents) stale.push(path);
  }
  if (stale.length === 0) {
    process.stdout.write("comparison: Dependabot result is up to date\n");
    return 0;
  }
  process.stderr.write(`comparison: stale files, rerun without --check: ${stale.join(", ")}\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
