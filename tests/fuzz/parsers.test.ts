import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import fc from "fast-check";

import { parseCleDocument } from "../../src/cle-ingest.js";
import { NpmDetector } from "../../src/detectors/npm.js";
import { PythonDetector } from "../../src/detectors/python.js";
import { parseTf } from "../../src/detectors/serverless/parse-tf.js";
import {
  detectorParsers,
  documentParsers,
  parsers,
  sourceParsers,
  type DetectorParserEntry,
  type DocumentParserEntry,
  type ParserEntry,
  type SourceParserEntry,
} from "./parsers.js";

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
  "---",
  "\n---\n",
  "{}",
  "[]",
  "[[",
  "]]",
  "(((",
  ")))",
  "{{",
  "}}",
  "<%",
  "%>",
  "<<<",
  ">>>",
  '{"a":',
  "}",
  "]",
  ",",
  ":",
  "key: value",
  "- item",
  "  - nested",
  "\t\t",
  "    ",
  "\n\n\n",
  "null",
  "true",
  "false",
  "undefined",
  "NaN",
  "Infinity",
  "0x7fffffff",
  "9223372036854775807",
  "1e309",
  "-1e309",
  "1.2.3-alpha+build",
  "^1.0.0",
  "~2",
  "=>",
  "->",
  "=> {",
  '"',
  "'",
  "'''",
  '"""',
  "\\\\",
  "\\u0000",
  "\\n",
  "$((",
  "`",
  "```",
  "${",
  "$__",
  "#comment",
  "!tag",
  "&anchor",
  "*alias",
  "|literal\n",
  ">folded\n",
  "%YAML",
  "!!binary",
  "<<1",
  "<<{",
  "<< ",
  "<<-",
  "<<EOF\nbody\nEOF\n",
  "@import",
  "include(",
  "require(",
  "eval(",
  "__proto__",
  "constructor",
  "prototype",
  "pkg:",
  "pkg:npm/a@1.0.0",
  "vers:npm/1.0.0",
  "vers-x/",
  "com.example:foo:1.2.3",
  "org.example",
  "github.com/owner/repo",
  "https://",
  "sha256:",
  "main..HEAD..other",
  "A".repeat(64),
  "\n".repeat(64),
  " ",
  "\u0000",
  "﻿",
  "😀",
  "&#x0;",
  "<script>",
  "%00",
];

const input = fc.oneof(
  fc.string({ maxLength: 4096 }),
  fc.array(fc.constantFrom(...HOSTILE_FRAGMENTS), { maxLength: 256 }).map((fragments) => fragments.join("")),
);

const DOCUMENT_KEYS = [
  "components",
  "metadata",
  "bomFormat",
  "specVersion",
  "packages",
  "externalRefs",
  "referenceType",
  "referenceLocator",
  "purl",
  "version",
  "package",
  "snapshots",
  "values",
  "root_module",
  "resources",
  "items",
  "kind",
  "apiVersion",
  "spec",
  "containers",
  "image",
  "Id",
  "Config",
  "State",
  "Service",
  "default",
  "develop",
] as const;

/** JSON-shaped input for parsers that read a document rather than text. */
const documentInput = fc.oneof(
  fc.jsonValue({ maxDepth: 5 }),
  fc.dictionary(fc.constantFrom(...DOCUMENT_KEYS), fc.jsonValue({ maxDepth: 4 }), { maxKeys: 24 }),
  fc.array(fc.oneof(fc.jsonValue({ maxDepth: 3 }), fc.constantFrom(...HOSTILE_FRAGMENTS)), { maxLength: 32 }),
);

for (const parser of parsers) {
  test(`${parser.name} tolerates hostile input`, { timeout: TEST_TIMEOUT_MS }, () => {
    fc.assert(
      fc.property(input, (contents) => {
        try {
          const first = run(parser, contents);
          const second = run(parser, contents);
          assert.deepEqual(second, first);
        } catch (error) {
          recordCrash({ target: parser.name, input: contents, error });
          throw error;
        }
      }),
      { numRuns: parser.runs ?? RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
    );
  });
}

for (const parser of documentParsers) {
  test(`${parser.name} tolerates hostile documents`, { timeout: TEST_TIMEOUT_MS }, async () => {
    await fc.assert(
      fc.asyncProperty(documentInput, async (document) => {
        try {
          const first = await runDocument(parser, document);
          const second = await runDocument(parser, document);
          assert.deepEqual(second, first);
        } catch (error) {
          recordCrash({ target: parser.name, input: document, error });
          throw error;
        }
      }),
      { numRuns: parser.runs ?? RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
    );
  });
}

for (const parser of detectorParsers) {
  test(`${parser.name} tolerates hostile input`, { timeout: TEST_TIMEOUT_MS }, async () => {
    const root = await mkdtemp(join(tmpdir(), "evergreen-fuzz-"));
    try {
      for (const [path, contents] of Object.entries(parser.seed ?? {})) await write(root, path, contents);
      await fc.assert(
        fc.asyncProperty(input, async (contents) => {
          try {
            const first = await runDetector(parser, root, contents);
            const second = await runDetector(parser, root, contents);
            assert.deepEqual(second, first);
          } catch (error) {
            recordCrash({ target: parser.name, file: parser.file, input: contents, error });
            throw error;
          }
        }),
        { numRuns: parser.runs ?? RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
      );
    } finally {
      // A run that fast-check stopped at the time limit can still be writing here; retry the removal.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
}

for (const parser of sourceParsers) {
  test(`${parser.name} tolerates hostile source`, { timeout: TEST_TIMEOUT_MS }, async () => {
    await fc.assert(
      fc.asyncProperty(input, async (source) => {
        try {
          const first = await runSource(parser, source);
          const second = await runSource(parser, source);
          assert.deepEqual(second, first);
        } catch (error) {
          recordCrash({ target: parser.name, input: source, error });
          throw error;
        }
      }),
      { numRuns: parser.runs ?? RUNS, interruptAfterTimeLimit: TIME_LIMIT_MS, markInterruptAsFailure: false },
    );
  });
}

// Pinned counterexamples found by this suite. A fuzz seed is random, so these keep their
// regressions covered deterministically.
test("parseTf terminates on `<<` that does not start a heredoc", () => {
  assert.deepEqual(parseTf("<<1"), []);
});

test("parseCleDocument tolerates hostile input", { timeout: TEST_TIMEOUT_MS }, () => {
  fc.assert(
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

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fuzz-regression-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) await write(root, path, contents);
  return root;
}

async function write(root: string, path: string, contents: string): Promise<void> {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

test("npm lockfile crashers from the fuzz corpus never fail the scan", async () => {
  const fixtures = resolve("tests/fixtures/fuzz/npm");
  const root = await repository({
    "package.json": JSON.stringify({ dependencies: { request: "^2.88.0" } }),
    "package-lock.json": await readFile(join(fixtures, "package-lock.json"), "utf8"),
    "npm-shrinkwrap.json": await readFile(join(fixtures, "npm-shrinkwrap.json"), "utf8"),
    "pnpm-lock.yaml": await readFile(join(fixtures, "pnpm-lock.yaml"), "utf8"),
    "bun.lock": await readFile(join(fixtures, "bun.lock"), "utf8"),
  });

  const findings = await new NpmDetector().scan({ root });
  assert.ok(
    findings.some((finding) => finding.ruleId.startsWith("npm.")),
    "the declared dependency is still reported",
  );
  assert.ok(
    findings.every((finding) => finding.confidence !== "inferred-from-lock"),
    "damaged lockfiles resolve nothing",
  );
});

test("python project crashers from the fuzz corpus never fail the scan", async () => {
  const fixtures = resolve("tests/fixtures/fuzz/python");

  const malformed = await repository({ "pyproject.toml": await readFile(join(fixtures, "pyproject.toml"), "utf8") });
  assert.deepEqual(await new PythonDetector().scan({ root: malformed }), []);

  const root = await repository({
    "pyproject.toml": '[project]\nname = "fuzz-target"\nrequires-python = ">=3.8"\n',
    "uv.lock": await readFile(join(fixtures, "uv.lock"), "utf8"),
    "Pipfile.lock": await readFile(join(fixtures, "Pipfile.lock"), "utf8"),
  });
  const findings = await new PythonDetector().scan({ root });
  assert.ok(
    findings.some((finding) => finding.summary.includes("Python 3.8")),
    "the project runtime is still reported",
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

async function runDocument(parser: DocumentParserEntry, document: unknown): Promise<Outcome> {
  const started = performance.now();
  try {
    const value = await parser.parse(document);
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

async function runDetector(parser: DetectorParserEntry, root: string, contents: string): Promise<Outcome> {
  await write(root, parser.file, contents);
  const started = performance.now();
  try {
    const value = await parser.detector.scan({ root, scannedAt: "2026-01-01T00:00:00Z" });
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

async function runSource(parser: SourceParserEntry, source: string): Promise<Outcome> {
  const started = performance.now();
  try {
    const value = await parser.parse(source);
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

/**
 * On failure the nightly job keeps the counterexample so it can be pinned as a regression test.
 * Artifacts are off unless `EVERGREEN_FUZZ_ARTIFACTS` names a directory; a shrinking failure may
 * try many smaller inputs, so the count per target is capped.
 */
const crashCounts = new Map<string, number>();

function recordCrash(entry: { target: string; input: unknown; error: unknown; file?: string }): void {
  const directory = process.env.EVERGREEN_FUZZ_ARTIFACTS;
  if (!directory) return;
  const count = (crashCounts.get(entry.target) ?? 0) + 1;
  crashCounts.set(entry.target, count);
  if (count > 10) return;
  const name = entry.target.replace(/[^a-zA-Z0-9.-]+/g, "-").toLowerCase();
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${name}-crash-${count}.json`),
    JSON.stringify(
      {
        target: entry.target,
        ...(entry.file === undefined ? {} : { file: entry.file }),
        input: entry.input,
        error: entry.error instanceof Error ? `${entry.error.name}: ${entry.error.message}` : String(entry.error),
      },
      null,
      2,
    ) + "\n",
  );
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got ${raw}`);
  return value;
}
