import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import type { SourceLanguage, SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";
import { maskCodeLine, type MaskState } from "../src/usage/masking.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** The `head` of a line kept as written, followed by `maskedCount` positions masked to spaces. */
function kept(head: string, maskedCount: number): string {
  return `${head}${" ".repeat(maskedCount)}`;
}

/** The whole line masked to spaces. */
function masked(text: string): string {
  return " ".repeat(text.length);
}

/** Masks a file the way a scan does: one state object carried from the first line to the last. */
function maskLines(language: SourceLanguage, lines: readonly string[]): string[] {
  const state: MaskState = { blockComment: false };
  return lines.map((line) => maskCodeLine(line, language, state));
}

test("keeps a Ruby line that has no string, comment, or literal to hide", () => {
  assert.deepEqual(maskLines("ruby", ["value = compute(1)", ""]), ["value = compute(1)", ""]);
});

test("masks every Ruby line after a bare __END__", () => {
  assert.deepEqual(maskLines("ruby", ["gem = 1", "__END__", "data = 'text'"]), [
    "gem = 1",
    masked("__END__"),
    masked("data = 'text'"),
  ]);
});

test("masks a Ruby heredoc body and stops at its terminator", () => {
  assert.deepEqual(maskLines("ruby", ["text = <<EOS", "plain line", "EOS", "after = 1"]), [
    kept("text = ", 5),
    masked("plain line"),
    masked("EOS"),
    "after = 1",
  ]);
});

test("masks a Ruby =begin block until =end", () => {
  assert.deepEqual(maskLines("ruby", ["=begin", "comment", "=end", "code = 1"]), [
    masked("=begin"),
    masked("comment"),
    masked("=end"),
    "code = 1",
  ]);
});

test("masks a Ruby percent literal and carries an unclosed one to the next line", () => {
  assert.deepEqual(maskLines("ruby", ["a = %w[one two]", "b = 1"]), [kept("a = ", 11), "b = 1"]);
  assert.deepEqual(maskLines("ruby", ["a = %w[one", "two]", "b = 1"]), [kept("a = ", 6), masked("two]"), "b = 1"]);
});

test("masks a Ruby character literal without opening a string", () => {
  assert.deepEqual(maskLines("ruby", ["x = ?a", "y = ?\\n", "z = ?"]), [kept("x = ", 2), kept("y = ", 3), "z = ?"]);
});

test("masks a Ruby regexp and blanks the rest of the line when it never closes", () => {
  assert.deepEqual(maskLines("ruby", ["y = /ab+c/", "w = 1"]), [kept("y = ", 6), "w = 1"]);
  assert.deepEqual(maskLines("ruby", ["z = /oops", "w = 1"]), [kept("z = ", 5), "w = 1"]);
});

test("masks a Ruby line comment but keeps division", () => {
  assert.deepEqual(maskLines("ruby", ["a = 1 # note", "b = 4 / 2"]), [kept("a = 1 ", 6), "b = 4 / 2"]);
});

test("carries an unclosed Ruby quote into the next line and stops at its quote", () => {
  assert.deepEqual(maskLines("ruby", ["a = 'unclosed", "b'; c = 2;"]), [kept("a = ", 9), `${masked("b'")}; c = 2;`]);
});

test("masks a PHP heredoc body and stops at a terminator written with its semicolon", () => {
  assert.deepEqual(maskLines("php", ["$t = <<<EOT", "body", "EOT;", "x = 1;"]), [
    kept("$t = ", 6),
    masked("body"),
    masked("EOT;"),
    "x = 1;",
  ]);
});

test("keeps a PHP attribute and masks a PHP line comment", () => {
  assert.deepEqual(maskLines("php", ["#[Attr]", "$x = 1; # note"]), ["#[Attr]", kept("$x = 1; ", 6)]);
});

test("carries an unclosed PHP string into the next line", () => {
  assert.deepEqual(maskLines("php", ['a = "unclosed', 'b"; $c = 2;']), [kept("a = ", 9), `${masked('b"')}; $c = 2;`]);
});

test("masks a Swift multiline string and its continuation lines", () => {
  assert.deepEqual(maskLines("swift", ['a = """text', "still", 'end""" more']), [
    kept("a = ", 7),
    masked("still"),
    `${masked('end"""')} more`,
  ]);
});

test("keeps a Swift nested block comment open until every level closes", () => {
  assert.deepEqual(maskLines("swift", ["/* outer /* inner */ still */ x = 1", "y = 2"]), [
    `${masked("/* outer /* inner */ still */")} x = 1`,
    "y = 2",
  ]);
});

test("masks a C# verbatim string and carries an unclosed one to the next line", () => {
  assert.deepEqual(maskLines("csharp", ['a = @"unclosed', 'b"; c = 2;']), [
    kept("a = ", 10),
    `${masked('b"')}; c = 2;`,
  ]);
});

test("keeps Rust character and backtick literals because Rust masks neither", () => {
  assert.deepEqual(maskLines("rust", ["let a = 'c';", "let b = `raw`;"]), ["let a = 'c';", "let b = `raw`;"]);
});

test("masks a Python line comment and a quoted string but not a backtick", () => {
  assert.deepEqual(maskLines("python", ["x = `not a string`  # note", 'y = "a"']), [
    kept("x = `not a string`  ", 6),
    kept("y = ", 3),
  ]);
});

test("carries a block comment across lines in a curly-brace language", () => {
  assert.deepEqual(maskLines("java", ["int a = 1; /* open", "still open */ int b = 2;"]), [
    kept("int a = 1; ", 7),
    `${masked("still open */ ")}int b = 2;`,
  ]);
});

const requestContract: SourceUsageContract = {
  id: "request",
  matchers: [
    { kind: "import", language: "javascript", module: "request" },
    { kind: "call", language: "javascript", module: "request", targets: ["default", "get"] },
  ],
};

/** Reads one JavaScript file through the regex scanner, which is the only caller of the import forms below. */
async function javaScriptUsages(source: string): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-import-forms-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "index.js"), source);
  const [analysis] = await analyzeSourceUsage(root, [requestContract], { parser: false });
  return (analysis?.usages ?? []).map((usage) => `${usage.kind} ${usage.location.line}:${usage.location.column}`);
}

test("reads a default import and calls the local binding", async () => {
  assert.deepEqual(await javaScriptUsages('import legacy from "request";\nlegacy(url);\n'), [
    "import 1:21",
    "call 2:1",
  ]);
});

test("reads a side-effect import with no bindings", async () => {
  assert.deepEqual(await javaScriptUsages('import "request";\n'), ["import 1:9"]);
});

test("reads a whole-module require and calls it both directly and through a member", async () => {
  assert.deepEqual(await javaScriptUsages('const rq = require("request");\nrq(url);\nrq.get(url);\n'), [
    "import 1:21",
    "call 2:1",
    "call 3:1",
  ]);
});

test("reads a destructured require and honours its alias", async () => {
  assert.deepEqual(await javaScriptUsages('const { get: fetch } = require("request");\nfetch(url);\n'), [
    "import 1:33",
    "call 2:1",
  ]);
});

test("reads a dynamic import with no bindings", async () => {
  assert.deepEqual(await javaScriptUsages('const mod = await import("request");\nmod.get(url);\n'), ["import 1:27"]);
});
