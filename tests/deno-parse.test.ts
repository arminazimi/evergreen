import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exactVersionPin,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseBunfig,
  parseBunVersion,
  parseDenoJson,
} from "../src/detectors/deno/parse.js";

test("exactVersionPin identifies concrete pins and rejects ranges/variables/latest", () => {
  assert.equal(exactVersionPin("1.38.0"), "1.38.0");
  assert.equal(exactVersionPin("v1.40.1"), "1.40.1");
  assert.equal(exactVersionPin("bun-v1.1.20"), "1.1.20");
  assert.equal(exactVersionPin("bun-1.0.0"), "1.0.0");
  assert.equal(exactVersionPin("deno-v2.0.0"), "2.0.0");

  assert.equal(exactVersionPin("^1.0.0"), undefined);
  assert.equal(exactVersionPin("~1.1.0"), undefined);
  assert.equal(exactVersionPin(">=1.0.0"), undefined);
  assert.equal(exactVersionPin("1.x"), undefined);
  assert.equal(exactVersionPin("1.0.*"), undefined);
  assert.equal(exactVersionPin("latest"), undefined);
  assert.equal(exactVersionPin("$BUN_VERSION"), undefined);
  assert.equal(exactVersionPin(""), undefined);
});

test("parseBunVersion parses exact pins in .bun-version and ignores comments and ranges", () => {
  assert.deepEqual(parseBunVersion("1.1.20\n"), [{ kind: "bun-runtime", value: "1.1.20", line: 1 }]);
  assert.deepEqual(parseBunVersion("# bun version\n  v1.0.0 \n"), [{ kind: "bun-runtime", value: "1.0.0", line: 2 }]);
  assert.deepEqual(parseBunVersion("^1.0.0\n"), []);
  assert.deepEqual(parseBunVersion("latest\n"), []);
});

test("parseBunfig parses bunfig.toml for bun version pins", () => {
  const toml = `
# config
version = "1.1.20"
[runtime]
bun = "1.0.0"
`;
  assert.deepEqual(parseBunfig(toml), [
    { kind: "bun-runtime", value: "1.1.20", line: 3 },
    { kind: "bun-runtime", value: "1.0.0", line: 5 },
  ]);

  // Negative: range/wildcard/latest
  const rangeToml = `version = "^1.1.0"\n`;
  assert.deepEqual(parseBunfig(rangeToml), []);
});

test("parseDenoJson parses deno.json and deno.jsonc for deno/bun runtime pins", () => {
  const jsonc = `
// deno config
{
  "deno": "1.38.0",
  "engines": {
    "deno": "1.40.0",
    "bun": "1.0.0"
  }
}
`;
  assert.deepEqual(parseDenoJson(jsonc), [
    { kind: "deno-runtime", value: "1.38.0", line: 4 },
    { kind: "deno-runtime", value: "1.40.0", line: 6 },
    { kind: "bun-runtime", value: "1.0.0", line: 7 },
  ]);

  // Ranges are ignored
  const rangeJson = JSON.stringify({ deno: "^1.38.0", engines: { deno: ">=1.0.0" } });
  assert.deepEqual(parseDenoJson(rangeJson), []);
});

test("empty input has no declarations", () => {
  assert.deepEqual(parseBunVersion(""), []);
  assert.deepEqual(parseBunfig(""), []);
  assert.deepEqual(parseDenoJson(""), []);
});

test("input that is too large, or lines that are too long, give nothing instead of an error", () => {
  assert.deepEqual(parseBunVersion("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.doesNotThrow(() => parseBunVersion(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
  assert.deepEqual(parseBunfig("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseDenoJson("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
});

test("junk never throws", () => {
  for (const junk of ["\u0000\u0001\u0002", "\uFEFF", "}}}{{{", "\r\n\r\n", "a\nb\n".repeat(1000)]) {
    assert.doesNotThrow(() => parseBunVersion(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseBunfig(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseDenoJson(junk), JSON.stringify(junk.slice(0, 12)));
  }
});

test("the same input always gives the same declarations, with 1-based lines", () => {
  const input = '{\n  "deno": "1.38.0"\n}\n';
  const result = parseDenoJson(input);
  assert.deepEqual(parseDenoJson(input), result);
  for (const declaration of result) assert.ok(Number.isInteger(declaration.line) && declaration.line >= 1);
});
