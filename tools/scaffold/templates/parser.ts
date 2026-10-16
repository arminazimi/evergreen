import type { ScaffoldNames } from "../names.js";

/** `src/detectors/<id>/parse.ts`: a pure, bounded parser for the detector's declarations. */
export function parserTemplate(names: ScaffoldNames): string {
  return `/**
 * Parser for ${names.ecosystem} declarations.
 *
 * File contents are untrusted input, so this parser:
 *   - is pure: contents in, declarations out, with no file, network, clock, or process access;
 *   - never evaluates what it reads and never executes tools;
 *   - is bounded: input above ${"`"}MAXIMUM_INPUT_BYTES${"`"} or a line above ${"`"}MAXIMUM_LINE_LENGTH${"`"} yields nothing;
 *   - returns nothing, not an error, for forms it does not support (dynamic values, unknown syntax). List each
 *     such form here so the limits are documented where they are enforced:
 *
 *       - (none documented yet)
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface ${names.pascal}Declaration {
  /** The declared value, exactly as written. */
  value: string;
  /** The 1-based line of the declaration, so findings point at the exact place. */
  line: number;
}

export function parse${names.pascal}(contents: string): ${names.pascal}Declaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: ${names.pascal}Declaration[] = [];
  for (const [index, line] of contents.split(/\\r?\\n/).entries()) {
    if (line.length > MAXIMUM_LINE_LENGTH) continue;
    // Recognize one declaration per line here and push { value, line: index + 1 }.
    void index;
  }
  return declarations;
}
`;
}

/** `tests/<id>-parse.test.ts`: the invariants every parser must keep, whatever it learns to read. */
export function parserTestTemplate(names: ScaffoldNames): string {
  return `import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, parse${names.pascal} } from "../src/detectors/${names.id}/parse.js";

test("empty input has no declarations", () => {
  assert.deepEqual(parse${names.pascal}(""), []);
});

test("input that is too large, or lines that are too long, give nothing instead of an error", () => {
  assert.deepEqual(parse${names.pascal}("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.doesNotThrow(() => parse${names.pascal}(\`\${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\\n\`));
});

test("junk never throws", () => {
  for (const junk of ["\\u0000\\u0001\\u0002", "\\uFEFF", "}}}{{{", "\\r\\n\\r\\n", "a\\nb\\n".repeat(1000)]) {
    assert.doesNotThrow(() => parse${names.pascal}(junk), JSON.stringify(junk.slice(0, 12)));
  }
});

test("the same input always gives the same declarations, with 1-based lines", () => {
  const input = "first\\nsecond\\r\\nthird\\n";
  const result = parse${names.pascal}(input);
  assert.deepEqual(parse${names.pascal}(input), result);
  for (const declaration of result) assert.ok(Number.isInteger(declaration.line) && declaration.line >= 1);
});

// Add one test per declaration form the parser reads, using the fixtures in tests/fixtures/${names.id}/, and one
// per lookalike it must ignore.
`;
}
