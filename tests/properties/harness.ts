/**
 * Shared harness for the parser property suites in `tests/properties/`.
 *
 * A case names one parser, how to build a canonical input for it, and the value alphabets that input
 * may carry. The harness turns that into the properties every parser must hold:
 *
 * - **round trip** — a valid input encodes what it declares, so the parse result carries every
 *   marker back exactly as written;
 * - **re-parse stability** — the same input always parses to the same value;
 * - **no crash on arbitrary input** — plain arbitrary text must not throw, must stay stable, and must
 *   finish within one run's budget. `tests/fuzz/parsers.test.ts` covers the same property with
 *   grammar-flavored hostile fragments; this suite keeps it independent of that seed.
 *
 * The parser names come from `tests/fuzz/parsers.ts`, the single registry of everything Evergreen
 * parses, so a parser cannot join one suite and be missed by the other.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fc from "fast-check";

import {
  detectorParsers,
  documentParsers,
  parsers,
  sourceParsers,
  type DetectorParserEntry,
  type DocumentParserEntry,
  type ParserEntry,
  type SourceParserEntry,
} from "../fuzz/parsers.js";

/** Iterations per property. The nightly fuzz job raises this like `tests/fuzz/parsers.test.ts`. */
export const RUNS = readPositiveInteger("EVERGREEN_FUZZ_RUNS", 40);
/** Wall-clock limit per property before the remaining iterations are skipped. */
export const TIME_LIMIT_MS = readPositiveInteger("EVERGREEN_FUZZ_MS", 20_000);
/** No single input may keep a parser busy longer than this. */
export const SINGLE_RUN_BUDGET_MS = 1_000;
export const TEST_TIMEOUT_MS = TIME_LIMIT_MS + 60_000;

export const PROPERTY_OPTIONS = {
  numRuns: RUNS,
  interruptAfterTimeLimit: TIME_LIMIT_MS,
  markInterruptAsFailure: false,
  /** A failing case names its own reason — which marker went missing — not only the input. */
  includeErrorInReport: true,
} as const;

/** Arbitrary text for the no-crash property. */
export const anyText = fc.string({ maxLength: 2048 });

/** The three values a generated input can carry. */
export interface GeneratedValues {
  readonly name: string;
  readonly version: string;
  readonly constraint: string;
}

/** The parts every round-trip case shares, whatever its input is. */
export interface CaseShape {
  /** Values the parse result must carry back; defaults to the name and version. */
  readonly markers?: (values: GeneratedValues) => readonly string[];
  /** The names this case may generate, `|`-separated, all valid for the format. */
  readonly names: string;
  /** The versions this case may generate, `|`-separated, all valid for the format. */
  readonly versions: string;
  /** The constraints this case may generate; one is picked per run. */
  readonly constraints?: string;
  /**
   * "version" for the parsers that report only the pinned value: a pin file names its tool by which
   * file it is, so the tool never appears in the parse result.
   */
  readonly reports?: "version";
}

/** A round-trip case for a parser that reads the text of one file. */
export interface RoundTripCase extends CaseShape {
  /** The name of the parser in `tests/fuzz/parsers.ts`. */
  readonly name: string;
  /** Builds the file contents from a generated name, version, and constraint. */
  readonly file: (values: GeneratedValues) => string;
  /**
   * "matcher" for the constraint matchers, whose result is a boolean rather than a declaration.
   * A matcher case names a version the constraint accepts (`versions`) and one it does not
   * (`rejected`); the property checks both, which is the round trip for a matcher.
   */
  readonly kind?: "matcher";
  /** For a matcher case: a version the constraint must not accept. */
  readonly rejected?: string;
  /** For a matcher case: the matcher itself, called with the generated constraint and a version. */
  readonly match?: (constraint: string, version: string) => boolean | undefined;
}

/** A round-trip case for a parser whose input is a JSON-shaped document rather than text. */
export interface DocumentRoundTripCase extends CaseShape {
  /** The name of the document parser in `tests/fuzz/parsers.ts`. */
  readonly name: string;
  /** Builds the document from a generated name, version, and constraint. */
  readonly document: (values: GeneratedValues) => unknown;
}

/**
 * A round-trip case for a detector, which reads a directory. The generated contents go to the file
 * the registry entry names, on top of that entry's seed files, so the detector judges one file.
 * A case may replace those seeds when the finding it expects needs a declaration of its own.
 */
export interface DetectorRoundTripCase extends CaseShape {
  /** The name of the detector entry in `tests/fuzz/parsers.ts`. */
  readonly name: string;
  readonly file: (values: GeneratedValues) => string;
  /** Files written before the case file, replacing the registry entry's seed. */
  readonly seed?: (values: GeneratedValues) => Readonly<Record<string, string>>;
}

/**
 * A round-trip case for a source-code parser. The registry runs these analyzers with no usage
 * contracts, which finds nothing in any source, so a case supplies the same call with the contract
 * its package declares: the property is that the call site comes back.
 */
export interface SourceRoundTripCase extends CaseShape {
  /** The name of the source parser in `tests/fuzz/parsers.ts`. */
  readonly name: string;
  readonly source: (values: GeneratedValues) => string;
  readonly run: (source: string) => unknown | Promise<unknown>;
}

/** Runs a case's callbacks over each combination of its alphabets. */
function valueArb(shape: CaseShape): fc.Arbitrary<GeneratedValues> {
  const constraints = shape.constraints ?? shape.versions;
  return fc.record({
    name: fc.constantFrom(...shape.names.split("|")),
    version: fc.constantFrom(...shape.versions.split("|")),
    constraint: fc.constantFrom(...constraints.split("|")),
  });
}

/** The registry entry a case names; fails fast when the fuzz table renames or drops a parser. */
function entryNamed<T extends { name: string }>(table: readonly T[], name: string, kind: string): T {
  const entry = table.find((candidate) => candidate.name === name);
  assert.ok(entry, `the ${kind} parser "${name}" is not registered in tests/fuzz/parsers.ts`);
  return entry;
}

export function entryFor(name: string): ParserEntry {
  return entryNamed(parsers, name, "string");
}

/** Runs a parser, letting only its deliberate typed errors through, and enforces the run budget. */
function guarded(
  name: string,
  allowed: readonly (new (message: string) => Error)[] | undefined,
  parse: () => unknown,
): unknown {
  const started = performance.now();
  try {
    return parse();
  } catch (error: unknown) {
    if (allowed?.some((expected) => error instanceof expected)) return undefined;
    throw error;
  } finally {
    assertWithinBudget(name, started);
  }
}

export function runEntry(entry: ParserEntry, contents: string): unknown {
  return guarded(entry.name, entry.allowedErrors, () => entry.parse(contents));
}

export function assertWithinBudget(name: string, startedAt: number): void {
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed <= SINGLE_RUN_BUDGET_MS, `${name} spent ${Math.round(elapsed)}ms on one input`);
}

/** Every value a parse result carries: strings, object keys, and the text form of numbers. */
export function stringsIn(value: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown, key: string | undefined): void => {
    if (key !== undefined) found.push(key);
    if (typeof node === "string") found.push(node);
    else if (typeof node === "number" || typeof node === "boolean") found.push(String(node));
    else if (Array.isArray(node)) for (const item of node) visit(item, undefined);
    else if (node instanceof Map) {
      for (const [childKey, child] of node) visit(child, typeof childKey === "string" ? childKey : undefined);
    } else if (node !== null && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
    }
  };
  visit(value, undefined);
  return found;
}

/** What a case must see come back when it names no markers: the input's identity, or just its version. */
function defaultMarkers(shape: CaseShape, generated: GeneratedValues): readonly string[] {
  return shape.reports === "version" ? [generated.version] : [generated.name, generated.version];
}

function assertCarries(what: string, carried: readonly string[], markers: readonly string[], input: string): void {
  for (const marker of markers) {
    assert.ok(
      carried.includes(marker),
      `${what} did not carry "${marker}" back from:\n${input}\nit returned ${carried.join(", ") || "(nothing)"}`,
    );
  }
}

/**
 * The same check for results that report a value inside a sentence rather than as its own field —
 * a detector finding names the package and its version in the summary it writes for a human.
 */
function assertCarriesText(what: string, text: string, markers: readonly string[], input: string): void {
  for (const marker of markers) {
    assert.ok(
      text.includes(marker),
      `${what} did not carry "${marker}" back from:\n${input}\nit returned ${text || "(nothing)"}`,
    );
  }
}

/** How a suite turns a result into the values it reports, and checks the markers against them. */
type Carries = (what: string, result: unknown, markers: readonly string[], input: string) => void;

/** The values a result reports as fields of their own. */
const carriesFields: Carries = (what, result, markers, input) => {
  assertCarries(what, stringsIn(result), markers, input);
};

/** The whole text of a result, for a parser that answers in prose. */
const carriesText: Carries = (what, result, markers, input) => {
  assertCarriesText(what, JSON.stringify(result) ?? "", markers, input);
};

/** The round trip and stability properties, for any case shape and any way of running it. */
async function checkCase(
  shape: CaseShape,
  what: string,
  build: (values: GeneratedValues) => unknown,
  parse: (input: unknown, values: GeneratedValues) => unknown | Promise<unknown>,
  carries: Carries,
): Promise<void> {
  await fc.assert(
    fc.asyncProperty(valueArb(shape), async (generated) => {
      const input = build(generated);
      const shown = typeof input === "string" ? input : JSON.stringify(input);
      const first = await parse(input, generated);
      carries(what, first, shape.markers?.(generated) ?? defaultMarkers(shape, generated), shown);
      assert.deepEqual(await parse(input, generated), first, `${what} is not stable on the same valid input`);
    }),
    PROPERTY_OPTIONS,
  );
}

/** The round trip and stability properties for one text parser. */
export function checkRoundTrip(target: RoundTripCase): void {
  if (target.kind === "matcher") {
    checkMatcherRoundTrip(target);
    return;
  }
  const entry = entryFor(target.name);
  fc.assert(
    fc.property(valueArb(target), (generated) => {
      const contents = target.file(generated);
      const first = runEntry(entry, contents);
      assertCarries(
        entry.name,
        stringsIn(first),
        target.markers?.(generated) ?? defaultMarkers(target, generated),
        contents,
      );
      assert.deepEqual(runEntry(entry, contents), first, `${target.name} is not stable on the same valid file`);
    }),
    PROPERTY_OPTIONS,
  );
}

/** A constraint matcher accepts the version its case names and refuses the version it rejects. */
function checkMatcherRoundTrip(target: RoundTripCase): void {
  const entry = entryFor(target.name);
  const values = valueArb(target);
  const rejected = (target.rejected ?? "").split("|");
  assert.ok(target.match !== undefined && rejected.length > 0, `matcher case ${target.name} needs match and rejected`);
  const match = target.match;
  fc.assert(
    fc.property(values, fc.constantFrom(...rejected), (generated, refused) => {
      const contents = target.file(generated);
      assert.equal(
        match(contents, generated.version),
        true,
        `${target.name} refused ${generated.version} under ${contents}`,
      );
      assert.notEqual(match(contents, refused), true, `${target.name} accepted ${refused} under ${contents}`);
      assert.deepEqual(runEntry(entry, contents), runEntry(entry, contents), `${target.name} is not stable`);
    }),
    PROPERTY_OPTIONS,
  );
}

/** The round trip and stability properties for one document parser. */
export async function checkDocumentRoundTrip(target: DocumentRoundTripCase): Promise<void> {
  const entry = entryNamed(documentParsers, target.name, "document");
  await checkCase(
    target,
    entry.name,
    target.document,
    async (document) => {
      const started = performance.now();
      try {
        return await entry.parse(document);
      } catch (error: unknown) {
        if (entry.allowedErrors?.some((expected) => error instanceof expected)) return undefined;
        throw error;
      } finally {
        assertWithinBudget(entry.name, started);
      }
    },
    carriesFields,
  );
}

/** The round trip and stability properties for one detector, in a temporary repository. */
export async function checkDetectorRoundTrip(target: DetectorRoundTripCase): Promise<void> {
  const entry = entryNamed(detectorParsers, target.name, "detector");
  const root = await mkdtemp(join(tmpdir(), "evergreen-properties-"));
  try {
    await checkCase(
      target,
      entry.name,
      (values) => target.file(values),
      async (input, values) => {
        const seeds = target.seed?.(values) ?? entry.seed ?? {};
        for (const [path, contents] of Object.entries(seeds)) await write(root, path, contents);
        await write(root, entry.file, String(input));
        const started = performance.now();
        try {
          return await entry.detector.scan({ root, scannedAt: "2026-01-01T00:00:00Z" });
        } finally {
          assertWithinBudget(entry.name, started);
        }
      },
      carriesText,
    );
  } finally {
    // A run fast-check stopped at the time limit can still be writing here; retry the removal.
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** The round trip and stability properties for one source-code parser. */
export async function checkSourceRoundTrip(target: SourceRoundTripCase): Promise<void> {
  const entry = entryNamed(sourceParsers, target.name, "source");
  await checkCase(target, entry.name, target.source, (input) => target.run(String(input)), carriesFields);
}

async function write(root: string, path: string, contents: string): Promise<void> {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

/** The no-crash and stability properties on arbitrary text for one registry parser. */
export function checkToleratesArbitraryText(name: string): void {
  const entry = entryFor(name);
  fc.assert(
    fc.property(anyText, (contents) => {
      const first = runEntry(entry, contents);
      assert.deepEqual(runEntry(entry, contents), first, `${name} returned different values for the same input`);
    }),
    PROPERTY_OPTIONS,
  );
}

/** Every parser the fuzz registry knows, by name, so a suite can prove none is left out. */
export function registeredParserNames(): string[] {
  return [
    ...parsers.map((entry) => entry.name),
    ...documentParsers.map((entry) => entry.name),
    ...detectorParsers.map((entry) => entry.name),
    ...sourceParsers.map((entry) => entry.name),
  ];
}

export { detectorParsers, documentParsers, parsers, sourceParsers };
export type { DetectorParserEntry, DocumentParserEntry, ParserEntry, SourceParserEntry };

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got ${raw}`);
  return value;
}
