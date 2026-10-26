import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  elixirVersion,
  otpFromElixirPin,
  parseToolVersions,
} from "../src/detectors/elixir/parse-elixir-runtime.js";
import { parseMixExs } from "../src/detectors/elixir/parse-mix-exs.js";
import { parseMixLock } from "../src/detectors/elixir/parse-mix-lock.js";

const fixtures = resolve("tests/fixtures/elixir");

async function fixture(...parts: string[]): Promise<string> {
  return readFile(resolve(fixtures, ...parts), "utf8");
}

test("empty input has no declarations", () => {
  assert.deepEqual(parseToolVersions(""), []);
  assert.deepEqual(parseMixExs(""), []);
  assert.deepEqual(parseMixLock(""), []);
});

test("input that is too large, or lines that are too long, give nothing instead of an error", () => {
  assert.deepEqual(parseToolVersions("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseMixExs("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseMixLock("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.doesNotThrow(() => parseToolVersions(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
  assert.doesNotThrow(() => parseMixExs(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
  assert.doesNotThrow(() => parseMixLock(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
});

test("junk never throws", () => {
  for (const junk of ["\u0000\u0001\u0002", "\uFEFF", "}}}{{{", "\r\n\r\n", "a\nb\n".repeat(1000)]) {
    assert.doesNotThrow(() => parseToolVersions(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseMixExs(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseMixLock(junk), JSON.stringify(junk.slice(0, 12)));
  }
});

test("strips the asdf otp suffix from an Elixir pin", () => {
  assert.equal(elixirVersion("1.14.5-otp-25"), "1.14.5");
  assert.equal(elixirVersion("1.14.5"), "1.14.5");
  assert.equal(otpFromElixirPin("1.14.5-otp-25"), "25");
  assert.equal(otpFromElixirPin("1.14.5"), undefined);
});

test("parses Elixir and Erlang pins from .tool-versions with exact lines", async () => {
  assert.deepEqual(parseToolVersions(await fixture("positive/.tool-versions")), [
    { kind: "elixir", value: "1.14.5", line: 2 },
    { kind: "erlang", value: "25", line: 2 },
    { kind: "erlang", value: "25.3.2", line: 3 },
  ]);
  assert.deepEqual(parseToolVersions(await fixture("zero/.tool-versions")), [
    { kind: "elixir", value: "1.18.1", line: 1 },
    { kind: "erlang", value: "27.3", line: 2 },
  ]);
  assert.deepEqual(parseToolVersions(await fixture("malformed/.tool-versions")), []);
});

test(".tool-versions ignores other tools and rejects a mixed unsupported line", () => {
  assert.deepEqual(parseToolVersions("nodejs 22.11.0\nelixir 1.17.3\n"), [{ kind: "elixir", value: "1.17.3", line: 2 }]);
  assert.deepEqual(parseToolVersions("elixir 1.14.5 system\n"), []);
  assert.deepEqual(parseToolVersions("erlang 25.3 latest\n"), []);
});

test("parses mix.exs elixir: and Hex deps with exact lines", async () => {
  assert.deepEqual(parseMixExs(await fixture("positive/mix.exs")), [
    { kind: "elixir", value: "1.14.5", line: 8 },
    { kind: "package", name: "fennec", value: "~> 0.3.0", line: 15 },
    { kind: "package", name: "jason", value: "~> 1.4", line: 16 },
  ]);
  assert.deepEqual(parseMixExs(await fixture("negative/mix.exs")), [
    { kind: "elixir", value: "~> 1.17", line: 8 },
    { kind: "package", name: "jason", value: "~> 1.4", line: 15 },
  ]);
  assert.deepEqual(parseMixExs(await fixture("malformed/mix.exs")), []);
});

test("parses Hex packages from mix.lock and ignores non-Hex sources", async () => {
  assert.deepEqual(parseMixLock(await fixture("positive/mix.lock")), [
    { kind: "locked-package", name: "fennec", value: "0.3.0", line: 2 },
    { kind: "locked-package", name: "jason", value: "1.4.4", line: 3 },
  ]);
  assert.deepEqual(parseMixLock(await fixture("malformed/mix.lock")), []);
});
