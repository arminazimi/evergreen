import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { test } from "node:test";

import { registeredParserNames } from "./harness.js";

/**
 * The gate on the suites in this directory: every parser the fuzz registry knows must appear as a
 * round-trip case somewhere, and every case must name a parser that still exists.
 *
 * `node --test` runs each file in its own process, so the suites cannot hand this test their case
 * tables at runtime; it reads their sources instead. A case is the one entry in these files that opens
 * with `name: "…"`, which is what the extractor matches.
 */

const SUITE_DIRECTORY = join(import.meta.dirname, "..", "..", "..", "tests", "properties");

/** Every parser name a suite in this directory covers, from its case tables. */
async function coveredParserNames(): Promise<Set<string>> {
  const covered = new Set<string>();
  for (const file of (await readdir(SUITE_DIRECTORY)).filter((name) => name.endsWith(".test.ts"))) {
    const source = await readFile(join(SUITE_DIRECTORY, file), "utf8");
    // A case opens its object on its own line, or writes the whole case on one line starting at an indent.
    for (const match of source.matchAll(/^ {2,}(?:\{ )?name:\s*"((?:[^"\\]|\\.)*)"/gm)) covered.add(match[1] ?? "");
  }
  return covered;
}

test("every registered parser has a round-trip case", async () => {
  const covered = await coveredParserNames();
  const missing = registeredParserNames().filter((name) => !covered.has(name));
  assert.deepEqual(missing, [], `${missing.length} parser(s) have no round-trip case: ${missing.join(", ")}`);
});

test("every case names a parser the fuzz registry still registers", async () => {
  const registered = new Set(registeredParserNames());
  const stale = [...(await coveredParserNames())].filter((name) => !registered.has(name));
  assert.deepEqual(stale, [], `${stale.length} case(s) name a parser that is not registered: ${stale.join(", ")}`);
});
