import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseConanfilePy,
  parseConanfileTxt,
} from "../src/detectors/cpp/parse-conan.js";

const fixtures = resolve("tests/fixtures/cpp");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses the direct requirements of a conanfile.txt with exact lines", async () => {
  assert.deepEqual(parseConanfileTxt(await fixture("positive/conanfile.txt")), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
    { kind: "conan-requirement", name: "openssl", value: "1.1.1t", line: 3 },
  ]);
  assert.deepEqual(parseConanfileTxt(await fixture("zero/conanfile.txt")), [
    { kind: "conan-requirement", name: "fmt", value: "11.0.2", line: 2 },
    { kind: "conan-requirement", name: "zlib", value: "1.3.1", line: 3 },
  ]);
});

test("conanfile.txt ignores comments, other sections, and lookalike values", async () => {
  assert.deepEqual(parseConanfileTxt(await fixture("negative/conanfile.txt")), []);
  assert.deepEqual(parseConanfileTxt(await fixture("malformed/conanfile.txt")), []);
  for (const contents of [
    "[generators]\nCMakeDeps\n",
    "[options]\nzlib/*:shared=False\n",
    "[requires]\nzlib\n",
    "[requires]\nzlib/\n",
    "[requires]\nzlib/[>=1.2 <2]\n",
    "[requires]\nzlib/[>=1.2<2]\n",
    "[requires]\nzlib/1.2.13:shared=True\n",
    "[requires]\nzlib/1.2.13 # pinned\n",
  ]) {
    assert.deepEqual(parseConanfileTxt(contents), [], contents);
  }
  assert.deepEqual(parseConanfileTxt("[requires]\nzlib/1.2.13\n[tool_requires]\ncmake/3.27.9\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
});

test("conanfile.txt reads only [requires], handles CRLF, and reports 1-based lines", () => {
  const contents = "[generators]\r\nCMakeDeps\r\n\r\n[requires]\r\n  zlib/1.2.13  \r\nopenssl/1.1.1t\r\n";
  assert.deepEqual(parseConanfileTxt(contents), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 5 },
    { kind: "conan-requirement", name: "openssl", value: "1.1.1t", line: 6 },
  ]);
  assert.deepEqual(parseConanfileTxt("[requires]\n# zlib/1.2.13\nzlib/1.2.13\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 3 },
  ]);
});

test("conanfile.txt keeps the version and ignores the user, channel, and revision", () => {
  assert.deepEqual(parseConanfileTxt("[requires]\nzlib/1.2.13@acme/stable#rev1\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
  assert.deepEqual(parseConanfileTxt("[requires]\nzlib/1.2.13#rev1\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
});

test("parses the requires attribute and literal self.requires calls from a conanfile.py with exact lines", async () => {
  assert.deepEqual(parseConanfilePy(await fixture("positive/conanfile.py")), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 8 },
    { kind: "conan-requirement", name: "openssl", value: "1.1.1t", line: 8 },
    { kind: "conan-requirement", name: "boost", value: "1.75.0", line: 11 },
  ]);
  assert.deepEqual(parseConanfilePy(await fixture("zero/conanfile.py")), [
    { kind: "conan-requirement", name: "boost", value: "1.86.0", line: 10 },
    { kind: "conan-requirement", name: "fmt", value: "11.0.2", line: 11 },
  ]);
});

test("conanfile.py ignores comments, prose, build tools, and dynamic values", async () => {
  assert.deepEqual(parseConanfilePy(await fixture("negative/conanfile.py")), []);
  for (const contents of [
    "class P(ConanFile):\n    build_requires = \"cmake/3.27.9\"\n",
    "class P(ConanFile):\n    tool_requires = \"cmake/3.27.9\"\n",
    "def requirements(self):\n    self.tool_requires(\"cmake/3.27.9\")\n",
    "def requirements(self):\n    self.requires(VERSION)\n",
    "def requirements(self):\n    self.requires(VERSION, headers=True)\n",
    "def requirements(self):\n    self.requires(f\"zlib/{VERSION}\")\n",
    "class P(ConanFile):\n    requires = [pkg for pkg in PACKAGES]\n",
    "class P(ConanFile):\n    requires = get_requirements()\n",
    "class P(ConanFile):\n    requires = \"zlib/\" + VERSION\n",
    "class P(ConanFile):\n    requires = \"zlib/1.2.13\" \"openssl/1.1.1t\"\n",
    "class P(ConanFile):\n    requires: list = [\"zlib/1.2.13\"]\n",
    "def requirements(self):\n    self.requires(\n        \"zlib/1.2.13\"\n    )\n",
  ]) {
    assert.deepEqual(parseConanfilePy(contents), [], contents);
  }
});

test("conanfile.py parses single strings, tuples, lists, and several call arguments", () => {
  assert.deepEqual(parseConanfilePy("class P(ConanFile):\n    requires = 'zlib/1.2.13'\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
  assert.deepEqual(parseConanfilePy("class P(ConanFile):\n    requires = (\"zlib/1.2.13\", \"openssl/1.1.1t\",)\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
    { kind: "conan-requirement", name: "openssl", value: "1.1.1t", line: 2 },
  ]);
  assert.deepEqual(parseConanfilePy("class P(ConanFile):\n    requires = [\"zlib/1.2.13\"]\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
  assert.deepEqual(parseConanfilePy("def requirements(self):\n    self.requires(\"zlib/1.2.13\", headers=True)  # pinned\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
  assert.deepEqual(parseConanfilePy("def requirements(self):\n    self.requires(\"zlib/1.2.13\", options={\"shared\": True})\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
  assert.deepEqual(parseConanfilePy("class P(ConanFile):\n    requires = \"zlib/1.2.13\", f\"openssl/{VERSION}\"\n"), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
});

test("conanfile.py never reads declarations out of comments, strings, or docstrings", () => {
  const contents = [
    '"""',
    'requires = "zlib/1.2.13"',
    'self.requires("openssl/1.1.1t")',
    '"""',
    '# requires = "zlib/1.2.13"',
    'class P(ConanFile):',
    '    description = "self.requires(\'curl/8.4.0\')"',
    '    requires = "fmt/11.0.2"',
    "",
  ].join("\n");
  assert.deepEqual(parseConanfilePy(contents), [
    { kind: "conan-requirement", name: "fmt", value: "11.0.2", line: 8 },
  ]);
});

test("a malformed conanfile.py returns nothing and never throws", async () => {
  const contents = await fixture("malformed/conanfile.py");
  assert.doesNotThrow(() => parseConanfilePy(contents));
  assert.deepEqual(parseConanfilePy(contents), []);
  for (const junk of [
    'class P(ConanFile):\n    requires = "zlib/1.2.13\n',
    'class P(ConanFile):\n    requires = "zlib/1.2.13"\n    description = "broken\n',
    '"""unterminated docstring\nrequires = "zlib/1.2.13"\n',
    "\u0000\u0001",
    "}}}",
    "\r\n\r\n",
  ]) {
    assert.doesNotThrow(() => parseConanfilePy(junk));
    assert.deepEqual(parseConanfilePy(junk), [], junk);
  }
});

test("both parsers bound untrusted input without losing later lines", () => {
  assert.deepEqual(parseConanfileTxt("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseConanfilePy("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseConanfileTxt(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n[requires]\nzlib/1.2.13\n`), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 3 },
  ]);
  assert.deepEqual(parseConanfilePy(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\nrequires = "zlib/1.2.13"\n`), [
    { kind: "conan-requirement", name: "zlib", value: "1.2.13", line: 2 },
  ]);
});

test("both parsers are deterministic", () => {
  const txt = "[requires]\nzlib/1.2.13\n";
  const py = 'class P(ConanFile):\n    requires = "zlib/1.2.13"\n';
  assert.deepEqual(parseConanfileTxt(txt), parseConanfileTxt(txt));
  assert.deepEqual(parseConanfilePy(py), parseConanfilePy(py));
});
