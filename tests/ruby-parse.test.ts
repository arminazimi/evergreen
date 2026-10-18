import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parseGemfile } from "../src/detectors/ruby/parse-gemfile.js";
import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseRubyVersion,
  parseToolVersions,
} from "../src/detectors/ruby/parse-ruby-runtime.js";

const fixtures = resolve("tests/fixtures/ruby");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses the pinned runtime from .ruby-version and .tool-versions with exact lines", async () => {
  assert.deepEqual(parseRubyVersion(await fixture("positive/.ruby-version")), [{ value: "3.2.2", line: 1 }]);
  assert.deepEqual(parseToolVersions(await fixture("positive/.tool-versions")), [{ value: "3.2.2", line: 2 }]);
  assert.deepEqual(parseRubyVersion(await fixture("zero/.ruby-version")), [{ value: "3.3.0", line: 1 }]);
  assert.deepEqual(parseToolVersions(await fixture("zero/.tool-versions")), [{ value: "3.3.0", line: 2 }]);
});

test("ignores comments, unrelated tools, and moving or dynamic values", async () => {
  assert.deepEqual(parseRubyVersion(await fixture("negative/.ruby-version")), []);
  assert.deepEqual(parseToolVersions(await fixture("negative/.tool-versions")), []);
});

test("malformed input returns nothing and never throws", async () => {
  assert.deepEqual(parseRubyVersion(await fixture("malformed/.ruby-version")), []);
  assert.deepEqual(parseToolVersions(await fixture("malformed/.tool-versions")), []);
  for (const parser of [parseRubyVersion, parseToolVersions]) {
    for (const junk of ["\u0000\u0001", "\uFEFF", "}}}", "\r\n\r\n", "x".repeat(MAXIMUM_LINE_LENGTH + 1)]) {
      assert.doesNotThrow(() => parser(junk));
      assert.deepEqual(parser(junk), []);
    }
  }
});

test("bounds untrusted input without losing later lines", () => {
  assert.deepEqual(parseRubyVersion("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseToolVersions("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseRubyVersion(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n3.2.2\n`), [{ value: "3.2.2", line: 2 }]);
  assert.deepEqual(parseToolVersions(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\nruby 3.2.2\n`), [{ value: "3.2.2", line: 2 }]);
});

test("handles CRLF, blank lines, comments, and 1-based lines", () => {
  assert.deepEqual(parseRubyVersion("3.2.2\r\n"), [{ value: "3.2.2", line: 1 }]);
  assert.deepEqual(parseRubyVersion("\n# pinned\n  3.2.2  \n"), [{ value: "3.2.2", line: 3 }]);
  assert.deepEqual(parseToolVersions("nodejs 20.11.0\r\nruby 3.2.2\r\n"), [{ value: "3.2.2", line: 2 }]);
  assert.deepEqual(parseToolVersions("# ruby 3.2.2\n  ruby\t3.2.2 # pinned\n"), [{ value: "3.2.2", line: 2 }]);
});

test("a .ruby-version with more than one version is ambiguous and returns nothing", () => {
  assert.deepEqual(parseRubyVersion("3.2.2\n3.3.0\n"), []);
  assert.deepEqual(parseRubyVersion("3.2.2\nsystem\n"), []);
});

test(".tool-versions reads every pinned fallback version and rejects a mixed line", () => {
  assert.deepEqual(parseToolVersions("ruby 3.2.2 3.1.4\n"), [
    { value: "3.2.2", line: 1 },
    { value: "3.1.4", line: 1 },
  ]);
  assert.deepEqual(parseToolVersions("ruby 3.2.2 ${RUBY_VERSION}\n"), []);
  assert.deepEqual(parseToolVersions("ruby\n"), []);
  assert.deepEqual(parseToolVersions("ruby latest\n"), []);
  assert.deepEqual(parseToolVersions("ruby system\n"), []);
});

test("accepts the rbenv prefix and a patchlevel, and ignores other Ruby implementations", () => {
  assert.deepEqual(parseRubyVersion("3.2\n"), [{ value: "3.2", line: 1 }]);
  assert.deepEqual(parseRubyVersion("ruby-3.2.2\n"), [{ value: "ruby-3.2.2", line: 1 }]);
  assert.deepEqual(parseRubyVersion("3.2.2p53\n"), [{ value: "3.2.2p53", line: 1 }]);
  assert.deepEqual(parseToolVersions("ruby 3.2\n"), [{ value: "3.2", line: 1 }]);
  assert.deepEqual(parseToolVersions("ruby ruby-3.2.2\n"), [{ value: "ruby-3.2.2", line: 1 }]);
  assert.deepEqual(parseRubyVersion("jruby-9.4.5.0\n"), []);
  assert.deepEqual(parseToolVersions("jruby 9.4.5.0\nruby 3.2.2\n"), [{ value: "3.2.2", line: 2 }]);
});

test("parses the ruby directive and direct gems from a Gemfile with exact lines", async () => {
  assert.deepEqual(parseGemfile(await fixture("positive/Gemfile")), [
    { kind: "ruby", value: "3.2.2", line: 3 },
    { kind: "gem", name: "rack", value: "2.2.8", line: 5 },
    { kind: "gem", name: "rake", value: "13.0.6", line: 8 },
  ]);
});

test("a valid Gemfile with no lifecycle findings still parses its declarations", async () => {
  assert.deepEqual(parseGemfile(await fixture("zero/Gemfile")), [
    { kind: "ruby", value: "3.3.0", line: 3 },
    { kind: "gem", name: "rake", value: "13.2.1", line: 5 },
  ]);
});

test("ignores comments, dynamic values, floating gems, git and path gems, groups, and gemspec directives", async () => {
  assert.deepEqual(parseGemfile(await fixture("negative/Gemfile")), []);
});

test("a malformed Gemfile returns nothing and never throws", async () => {
  const contents = await fixture("malformed/Gemfile");
  assert.doesNotThrow(() => parseGemfile(contents));
  assert.deepEqual(parseGemfile(contents), []);
  for (const junk of ['gem "rack", "1.0\n', 'gem "rack", ENV.fetch(\n', "\u0000\u0001", "\uFEFF", "}}}", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseGemfile(junk));
    assert.deepEqual(parseGemfile(junk), []);
  }
});

test("Gemfile parsing handles CRLF, single quotes, inline comments, groups, and bounds", () => {
  assert.deepEqual(parseGemfile("ruby '3.2.2'\r\ngem 'rack', '~> 2.2' # pinned\r\n"), [
    { kind: "ruby", value: "3.2.2", line: 1 },
    { kind: "gem", name: "rack", value: "~> 2.2", line: 2 },
  ]);
  assert.deepEqual(parseGemfile('group :test do\n  gem "rspec", "3.12.0"\nend\n'), [
    { kind: "gem", name: "rspec", value: "3.12.0", line: 2 },
  ]);
  assert.deepEqual(parseGemfile("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseGemfile(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\ngem "rack", "2.2.8"\n`), [
    { kind: "gem", name: "rack", value: "2.2.8", line: 2 },
  ]);
});

test("Gemfile ignores dynamic values and unsupported ruby directive forms", () => {
  assert.deepEqual(parseGemfile('ruby ENV["RUBY_VERSION"]\n'), []);
  assert.deepEqual(parseGemfile('ruby file: ".ruby-version"\n'), []);
  assert.deepEqual(parseGemfile('ruby "3.2.2", engine: "ruby"\n'), []);
  assert.deepEqual(parseGemfile('ruby "latest"\n'), []);
  assert.deepEqual(parseGemfile('gem "dynamic", ENV.fetch("GEM_VERSION")\n'), []);
  assert.deepEqual(parseGemfile('gem "interpolated", "#{GEM_VERSION}"\n'), []);
  assert.deepEqual(parseGemfile('gem "template", "${GEM_VERSION}"\n'), []);
  assert.deepEqual(parseGemfile('gem "floating"\n'), []);
  assert.deepEqual(parseGemfile('gem "from-git", git: "https://example.com/x.git"\n'), []);
  assert.deepEqual(parseGemfile('gem "from-path", path: "../x"\n'), []);
  assert.deepEqual(parseGemfile('gem "from-git", "1.2.3", git: "https://example.com/x.git"\n'), []);
  assert.deepEqual(parseGemfile('gem "from-path", "1.2.3", path: "../x"\n'), []);
  assert.deepEqual(parseGemfile('gem "rack", ""\n'), []);
  assert.deepEqual(parseGemfile('gem "rack", "2.2.8", require: false\n'), [
    { kind: "gem", name: "rack", value: "2.2.8", line: 1 },
  ]);
});
