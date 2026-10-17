import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, parseCargoToml } from "../src/detectors/rust/parse-cargo-toml.js";

async function fixture(path: string): Promise<string> {
  return readFile(resolve("tests/fixtures/rust", path), "utf8");
}

test("parses Cargo.toml dependencies from every table, edition, and rust-version with exact lines", async () => {
  assert.deepEqual(parseCargoToml(await fixture("positive/Cargo.toml")), [
    { kind: "edition", value: "2021", line: 4 },
    { kind: "rust-version", value: "1.70", line: 5 },
    { kind: "dependency", crate: "failure", name: "failure", section: "dependencies", value: "0.1.8", line: 8 },
    { kind: "dependency", crate: "tempdir", name: "tempdir", section: "dependencies", value: "0.3", line: 9 },
    { kind: "dependency", crate: "serde", name: "serde", section: "dependencies", value: "1.0", line: 10 },
    { kind: "dependency", crate: "atty", name: "console", section: "dependencies", value: "0.2.14", line: 11 },
    { kind: "dependency", crate: "ansi_term", name: "ansi_term", section: "dev-dependencies", value: "0.12", line: 14 },
    { kind: "dependency", crate: "cc", name: "cc", section: "build-dependencies", value: "1.0", line: 17 },
    { kind: "dependency", crate: "libc", name: "libc", section: "dependencies", value: "0.2", line: 20 },
  ]);
});

test("parses workspace.dependencies and the workspace edition", async () => {
  assert.deepEqual(parseCargoToml(await fixture("positive/workspace/Cargo.toml")), [
    { kind: "edition", value: "2018", line: 5 },
    { kind: "dependency", crate: "failure", name: "failure", section: "workspace", value: "0.1", line: 8 },
    { kind: "dependency", crate: "serde", name: "serde", section: "workspace", value: "1", line: 9 },
  ]);
});

test("ignores comments, prose, features, path, git, workspace, and dynamic dependencies", async () => {
  assert.deepEqual(
    parseCargoToml(await fixture("negative/Cargo.toml")).map((declaration) => [declaration.kind, declaration.value, declaration.line]),
    [["edition", "2021", 5], ["dependency", "1.0", 12]],
    "only edition and the plain serde dependency; nothing for failure, tempdir, local, fork, inherited, or dynamic",
  );
  assert.deepEqual(parseCargoToml(await fixture("zero/Cargo.toml")), [
    { kind: "edition", value: "2024", line: 4 },
    { kind: "dependency", crate: "serde", name: "serde", section: "dependencies", value: "1.0", line: 7 },
  ]);
});

test("reads a dependency written as its own table and dotted keys, and keeps renames", () => {
  const contents = [
    "[dependencies.failure]",
    'version = "0.1"',
    "",
    "[dependencies.console]",
    'package = "atty"',
    'version = "0.2"',
    "",
    "[dependencies]",
    'inherited.workspace = true',
    'dotted.version = "3"',
    "",
    "[dependencies.local]",
    'path = "../local"',
  ].join("\n");
  assert.deepEqual(parseCargoToml(contents), [
    { kind: "dependency", crate: "failure", name: "failure", section: "dependencies", value: "0.1", line: 1 },
    { kind: "dependency", crate: "atty", name: "console", section: "dependencies", value: "0.2", line: 4 },
    { kind: "dependency", crate: "dotted", name: "dotted", section: "dependencies", value: "3", line: 10 },
  ]);
});

test("malformed input returns nothing and never throws", async () => {
  const malformed = await fixture("malformed/Cargo.toml");
  assert.doesNotThrow(() => parseCargoToml(malformed));
  assert.deepEqual(parseCargoToml(malformed), []);
  for (const junk of ["\u0000\u0001", "[", "[[", "[a", 'a = "', "a b c", "=", "\r\n\r\n", "}}{{"]) {
    assert.doesNotThrow(() => parseCargoToml(junk));
    assert.deepEqual(parseCargoToml(junk), []);
  }
});

test("bounds untrusted input", () => {
  assert.deepEqual(parseCargoToml("#".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseCargoToml(`[dependencies]\nx = "${"1".repeat(MAXIMUM_LINE_LENGTH)}"\n`), []);
});

test("handles CRLF, comments after values, and single-quoted strings with 1-based lines", () => {
  const contents = "[dependencies]\r\nfailure = '0.1' # old\r\nserde = { version = \"1\", optional = true } # keep\r\n";
  assert.deepEqual(parseCargoToml(contents).map((declaration) => [declaration.kind === "dependency" ? declaration.crate : "", declaration.value, declaration.line]), [["failure", "0.1", 2], ["serde", "1", 3]]);
});
