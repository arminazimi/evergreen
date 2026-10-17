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

import { parseCargoLock } from "../src/detectors/rust/parse-cargo-lock.js";
import { parseRustToolchain } from "../src/detectors/rust/parse-rust-toolchain.js";

test("Cargo.lock: reads registry packages with the line of their version, and skips the project and path or git sources", async () => {
  assert.deepEqual(parseCargoLock(await fixture("positive/Cargo.lock")), [
    { crate: "failure", value: "0.1.8", line: 7 },
    { crate: "serde", value: "1.0.197", line: 21 },
  ]);
  assert.deepEqual(parseCargoLock(await fixture("negative/Cargo.lock")), [], "no source, so nothing from the registry");
  const mixed = ['[[package]]', 'name = "a"', 'version = "1.0.0"', 'source = "git+https://example.com/a#abc"', "", '[[package]]', 'name = "b"', 'version = "2.0.0"', 'source = "sparse+https://index.crates.io/"'].join("\n");
  assert.deepEqual(parseCargoLock(mixed), [{ crate: "b", value: "2.0.0", line: 8 }]);
});

test("Cargo.lock: malformed, truncated, and oversized input returns nothing", async () => {
  const malformed = await fixture("malformed/Cargo.lock");
  assert.doesNotThrow(() => parseCargoLock(malformed));
  assert.deepEqual(parseCargoLock(malformed), []);
  for (const junk of ["", "[[package]", '[[package]]\nname = "x"\nversion = ', "\u0000", "version = 3\n"]) assert.deepEqual(parseCargoLock(junk), []);
  assert.deepEqual(parseCargoLock("#".repeat(1024 * 1024 + 1)), []);
});

test("rust-toolchain: reads the pinned channel from the TOML and the legacy form with exact lines", async () => {
  assert.deepEqual(parseRustToolchain(await fixture("positive/rust-toolchain.toml")), [{ value: "1.70.0", line: 2 }]);
  assert.deepEqual(parseRustToolchain(await fixture("positive/legacy/rust-toolchain")), [{ value: "1.65.0", line: 1 }]);
  assert.deepEqual(parseRustToolchain("# a comment\n\n1.60.0 # pinned\n"), [{ value: "1.60.0", line: 3 }]);
  assert.deepEqual(parseRustToolchain("[toolchain]\r\nchannel = '1.75.0'\r\n"), [{ value: "1.75.0", line: 2 }]);
});

test("rust-toolchain: stable and nightly channels are returned as written, and comments, other keys, and malformed files return nothing", async () => {
  assert.deepEqual(parseRustToolchain(await fixture("zero/rust-toolchain.toml")), [{ value: "stable", line: 2 }]);
  assert.deepEqual(parseRustToolchain(await fixture("negative/rust-toolchain.toml")), [{ value: "stable", line: 3 }], "the commented-out 1.60.0 is ignored");
  assert.deepEqual(parseRustToolchain("[toolchain]\nchannel = 'nightly-2024-01-01'\n"), [{ value: "nightly-2024-01-01", line: 2 }]);
  assert.deepEqual(parseRustToolchain("[toolchain]\ncomponents = [\"clippy\"]\n"), []);
  assert.deepEqual(parseRustToolchain("[toolchain]\nchannel = 17\n"), []);
  assert.deepEqual(parseRustToolchain(""), []);
  const malformed = await fixture("malformed/rust-toolchain.toml");
  assert.doesNotThrow(() => parseRustToolchain(malformed));
  assert.deepEqual(parseRustToolchain(malformed), []);
  assert.deepEqual(parseRustToolchain("#".repeat(1024 * 1024 + 1)), []);
});

test("multi-line arrays are skipped over without losing the lines after them", () => {
  const contents = ["[dependencies]", 'serde = { version = "1", features = [', '  "derive",', "] }", 'failure = "0.1"', "", "[package]", "edition = \"2021\""].join("\n");
  // The multi-line serde entry is not read (documented); everything after it keeps its exact line.
  assert.deepEqual(
    parseCargoToml(contents).map((declaration) => [declaration.kind, declaration.value, declaration.line]),
    [["dependency", "0.1", 5], ["edition", "2021", 8]],
  );
  assert.deepEqual(parseCargoLock(['[[package]]', 'name = "a"', 'version = "1.0.0"', 'source = "registry+https://github.com/rust-lang/crates.io-index"', "dependencies = [", ' "b",', "]"].join("\n")), [{ crate: "a", value: "1.0.0", line: 3 }]);
});
