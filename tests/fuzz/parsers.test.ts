import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { parseCleDocument } from "../../src/cle-ingest.js";
import { parseTf } from "../../src/detectors/serverless/parse-tf.js";
import { parsers, type ParserEntry } from "./parsers.js";

/**
 * Property-based fuzzing for every manifest parser: arbitrary and grammar-flavored hostile input
 * must never crash, hang, or produce nondeterministic results. `npm run check` runs a small
 * budget on every commit; the nightly fuzz job raises `EVERGREEN_FUZZ_RUNS` and `EVERGREEN_FUZZ_MS`.
 */

/** Iterations per parser. Raised by the nightly fuzz job. */
const RUNS = readPositiveInteger("EVERGREEN_FUZZ_RUNS", 100);
/** Wall-clock limit per parser before remaining iterations are skipped. */
const TIME_LIMIT_MS = readPositiveInteger("EVERGREEN_FUZZ_MS", 5_000);
/** No single input may keep a parser busy longer than this. */
const SINGLE_RUN_BUDGET_MS = 1_000;
const TEST_TIMEOUT_MS = TIME_LIMIT_MS + 60_000;

/**
 * Fragments that appear in real manifests and lockfiles, plus the shapes that break naive
 * tokenizers: unbalanced brackets and quotes, escapes, tags, anchors, huge numbers, control
 * characters, and duplicate-inducing whitespace.
 */
const HOSTILE_FRAGMENTS = [
  "---", "\n---\n", "{}", "[]", "[[", "]]", "(((", ")))", "{{", "}}", "<%", "%>", "<<<", ">>>",
  "{\"a\":", "}", "]", ",", ":", "key: value", "- item", "  - nested", "\t\t", "    ", "\n\n\n",
  "null", "true", "false", "undefined", "NaN", "Infinity", "0x7fffffff", "9223372036854775807",
  "1e309", "-1e309", "1.2.3-alpha+build", "^1.0.0", "~2", "=>", "->", "=> {",
  "\"", "'", "'''", "\"\"\"", "\\\\", "\\u0000", "\\n", "$((", "`", "```", "${", "$__",
  "#comment", "!tag", "&anchor", "*alias", "|literal\n", ">folded\n", "%YAML", "!!binary",
  "<<1", "<<{", "<< ", "<<-", "<<EOF\nbody\nEOF\n",
  "@import", "include(", "require(", "eval(", "__proto__", "constructor", "prototype",
  "pkg:", "pkg:npm/a@1.0.0", "vers:npm/1.0.0", "vers-x/", "com.example:foo:1.2.3",
  "org.example", "github.com/owner/repo", "https://", "sha256:", "main..HEAD..other",
  "A".repeat(64), "\n".repeat(64), " ", "\u0000", "﻿", "😀", "&#x0;", "<script>", "%00",
];

const input = fc.oneof(
  fc.string({ maxLength: 4096 }),
  fc.array(fc.constantFrom(...HOSTILE_FRAGMENTS), { maxLength: 256 }).map((fragments) => fragments.join("")),
);

for (const parser of parsers) {
  test(`${parser.name} tolerates hostile input`, { timeout: TEST_TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(input, (contents) => {
        const first = run(parser, contents);
        const second = run(parser, contents);
        assert.deepEqual(second, first);
      }),
      { numRuns: RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
    );
  });
}

// Pinned counterexamples found by this suite. A fuzz seed is random, so these keep their
// regressions covered deterministically.
test("parseTf terminates on `<<` that does not start a heredoc", () => {
  assert.deepEqual(parseTf("<<1"), []);
});

test("parseCleDocument tolerates hostile input", { timeout: TEST_TIMEOUT_MS }, () => {  fc.assert(
    fc.property(fc.jsonValue({ maxDepth: 5 }), (document) => {
      const started = performance.now();
      try {
        parseCleDocument(document);
      } finally {
        const elapsed = performance.now() - started;
        assert.ok(elapsed <= SINGLE_RUN_BUDGET_MS, `parseCleDocument spent ${Math.round(elapsed)}ms on one input`);
      }
    }),
    { numRuns: RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
  );
});

type Outcome = { kind: "value"; value: unknown } | { kind: "deliberate"; error: string };

function run(parser: ParserEntry, contents: string): Outcome {
  const started = performance.now();
  try {
    const value = parser.parse(contents);
    assertWithinBudget(parser.name, started);
    return { kind: "value", value };
  } catch (error: unknown) {
    assertWithinBudget(parser.name, started);
    if (parser.allowedErrors?.some((expected) => error instanceof expected)) {
      return { kind: "deliberate", error: (error as Error).constructor.name };
    }
    throw error;
  }
}

function assertWithinBudget(name: string, started: number): void {
  const elapsed = performance.now() - started;
  assert.ok(elapsed <= SINGLE_RUN_BUDGET_MS, `${name} spent ${Math.round(elapsed)}ms on one input`);
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got ${raw}`);
  return value;
}
