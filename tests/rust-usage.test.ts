import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { RustDetector } from "../src/detectors/rust/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rust-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const contract = (module: string, targets: string[]) => [{ id: "c", matchers: [{ kind: "import" as const, language: "rust" as const, module }, { kind: "call" as const, language: "rust" as const, module, targets }] }];
const usages = async (files: Record<string, string>, module: string, targets: string[]) => (await analyzeSourceUsage(await repository(files), contract(module, targets)))[0]!.usages.map((usage) => [usage.kind, usage.location.path, usage.location.line, usage.symbol]);

test("reports use declarations (plain, aliased, grouped, nested, multi-line) and extern crate, with exact lines", async () => {
  const source = [
    "extern crate failure as f;", // 1
    "use failure::Error;", // 2
    "use failure::{Fail, ResultExt as Ctx};", // 3
    "use failure;", // 4
    "pub use ::failure::err_msg;", // 5
    "use failure::{", // 6
    "    self,", // 7
    "    Backtrace,", // 8
    "};", // 9
    "use failure_derive::Fail;", // 10: a different crate
    "use std::fmt;", // 11
  ].join("\n");
  const found = await usages({ "src/lib.rs": source }, "failure", []);
  // A grouped `use` on one line is one usage; failure_derive is a different crate.
  assert.deepEqual(found.map((item) => item[2]), [1, 2, 3, 4, 5, 6]);
  assert.ok(found.every((item) => item[0] === "import"));
});

test("reports qualified, aliased, imported, and macro calls, and not comments, strings, or lifetimes", async () => {
  const source = [
    "use failure::{err_msg, format_err};", // 1
    "use failure as f;", // 2
    "fn run<'a>(text: &'a str) -> Result<(), failure::Error> {", // 3 lifetime must not hide the line
    "    let a = err_msg(\"x\");", // 4 imported function
    "    let b = f::err_msg(\"y\");", // 5 through the alias
    "    let c = failure::err_msg(\"z\");", // 6 fully qualified
    "    let d = format_err!(\"{}\", text);", // 7 macro
    "    // failure::err_msg(\"comment\");", // 8
    "    let s = \"failure::err_msg(x)\";", // 9
    "    Err(a)",
    "}",
  ].join("\n");
  const found = await usages({ "src/lib.rs": source }, "failure", ["err_msg", "format_err"]);
  assert.deepEqual(found.filter((item) => item[0] === "call").map((item) => [item[2], item[3]]), [[4, "failure.err_msg"], [5, "failure.err_msg"], [6, "failure.err_msg"], [7, "failure.format_err"]]);
});

test("an associated function is matched through its imported type and through the full path", async () => {
  const source = ["use tempdir::TempDir;", "fn a() { let d = TempDir::new(\"x\"); }", "fn b() { let d = tempdir::TempDir::new(\"y\"); }", "fn c() { let d = Other::new(\"z\"); }"].join("\n");
  const found = await usages({ "src/main.rs": source }, "tempdir", ["TempDir::new"]);
  assert.deepEqual(found.filter((item) => item[0] === "call").map((item) => item[2]), [2, 3]);
});

test("glob imports are imports that bind no name, so calls through them are not guessed", async () => {
  const found = await usages({ "a.rs": ["use failure::*;", "fn a() { err_msg(\"x\"); }"].join("\n") }, "failure", ["err_msg"]);
  assert.deepEqual(found.map((item) => item[0]), ["import"]);
});

test("crate names are matched whole, local paths never match, and non-Rust files are ignored", async () => {
  const found = await usages(
    {
      "a.rs": ["use crate::failure::Error;", "use self::failure::Error;", "use super::failure::Error;", "mod failure {}"].join("\n"),
      "b.txt": "use failure::Error;",
      "c.py": "use failure::Error",
    },
    "failure",
    [],
  );
  assert.deepEqual(found, []);
});

test("a prefix path matches its crate: a module under tokio matches the tokio matcher", async () => {
  const found = await usages({ "a.rs": ["use tokio::sync::Mutex;", "use tokio::{time, sync::mpsc};", "use tokio_util::codec;"].join("\n") }, "tokio", []);
  assert.deepEqual(found.map((item) => item[2]), [1, 2], "tokio_util is a different crate");
});

test("Rust matchers are valid, and the abandoned-crate finding lists the files that use it, in the migration packet too", async () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "rust", module: "failure" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "rust", module: "failure", targets: ["err_msg"] }), true);
  const root = await repository({
    "Cargo.toml": '[package]\nname = "app"\n\n[dependencies]\nfailure = "0.1"\natty = "0.2"\n',
    "src/main.rs": ["use failure::Error;", "use atty::Stream;", "fn main() -> Result<(), Error> {", "    if atty::is(Stream::Stdout) {}", "    Ok(())", "}"].join("\n"),
    "src/lib.rs": "pub fn f() -> failure::Error { failure::err_msg(\"x\") }\n",
  });
  const result = await scanRepository(root, [new RustDetector()]);
  const failure = result.findings.find((finding) => finding.ruleId === "rust.crate.failure.unmaintained")!;
  assert.deepEqual([...new Set(failure.usages?.map((usage) => usage.location.path))].sort(), ["src/lib.rs", "src/main.rs"]);
  assert.deepEqual(failure.impact, { usageCount: 2, affectedFiles: 2, level: "low" });
  const atty = result.findings.find((finding) => finding.ruleId === "rust.crate.atty.unmaintained")!;
  assert.deepEqual(atty.usages?.map((usage) => [usage.kind, usage.location.line]), [["import", 2], ["call", 4]]);
  const packet = validateMigrationPacket(createMigrationPacket(result, failure.id));
  assert.deepEqual([...packet.affectedFiles].sort(), ["Cargo.toml", "src/lib.rs", "src/main.rs"]);
});
