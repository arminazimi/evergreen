import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { RubyDetector } from "../src/detectors/ruby/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { renderText } from "../src/reporters.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-ruby-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const contract = (module: string, targets: string[]) => [
  {
    id: "c",
    matchers: [
      { kind: "import" as const, language: "ruby" as const, module },
      { kind: "call" as const, language: "ruby" as const, module, targets },
    ],
  },
];

const usages = async (files: Record<string, string>, module: string, targets: string[]) =>
  (await analyzeSourceUsage(await repository(files), contract(module, targets)))[0]!.usages.map((usage) => [
    usage.kind,
    usage.location.path,
    usage.location.line,
    usage.location.column,
    usage.symbol,
  ]);

const at = (line: string, text: string) => line.indexOf(text) + 1;

test("reports require, load, gem, and autoload of a gem, including a submodule and an explicit .rb", async () => {
  const lines = [
    'require "json"',
    "require 'json/ext'",
    'require("json.rb")',
    "Kernel.require 'json/add/core'",
    '::Kernel.load "json.rb"',
    'gem "json", ">= 2"',
    'autoload :JSON, "json"',
    "require %q{json}",
  ];
  const found = await usages({ "lib/app.rb": lines.join("\n") }, "json", []);
  assert.deepEqual(
    found,
    lines.map((line, index) => ["import", "lib/app.rb", index + 1, at(line, "json"), "json"]),
  );
});

test("reports qualified calls, :: calls, and constant or variable aliases, including an alias of an alias", async () => {
  const lines = [
    "require 'json'",
    "def run(text)",
    "  parsed = JSON.parse(text)",
    "  JSON::generate(parsed)",
    "  Parser = JSON",
    "  parser = ::JSON",
    "  Legacy = Parser",
    "  Parser.parse(text)",
    "  parser.generate(text)",
    "  Legacy.dump(text)",
    "end",
  ];
  const found = await usages({ "lib/app.rb": lines.join("\n") }, "json", ["JSON.parse", "JSON.generate", "JSON.dump"]);
  assert.deepEqual(
    found.filter((item) => item[0] === "call"),
    [
      ["call", "lib/app.rb", 3, at(lines[2]!, "JSON"), "json.JSON.parse"],
      ["call", "lib/app.rb", 4, at(lines[3]!, "JSON"), "json.JSON.generate"],
      ["call", "lib/app.rb", 8, at(lines[7]!, "Parser"), "json.JSON.parse"],
      ["call", "lib/app.rb", 9, at(lines[8]!, "parser"), "json.JSON.generate"],
      ["call", "lib/app.rb", 10, at(lines[9]!, "Legacy"), "json.JSON.dump"],
    ],
  );
});

test("does not treat comments, strings, heredocs, block comments, other gems, local requires, or paren-less calls as usages", async () => {
  const source = [
    "# require \"json\"",
    'message = "require \\"json\\""',
    "text = <<EOS",
    'require "json"',
    "EOS",
    "=begin",
    "require 'json'",
    "=end",
    "require_relative \"json\"",
    "require \"json-schema\"",
    "require \"json_pure\"",
    "def run(text)",
    "  JSON.parse text",
    "  Oj.parse(text)",
    "  JSON.load(text)",
    "end",
    "require \"oj\"",
  ].join("\n");
  const found = await usages({ "lib/app.rb": source, "notes.txt": 'require "json"\n', "lib/app.py": 'require "json"\n' }, "json", ["JSON.parse", "JSON.load"]);
  assert.deepEqual(found, [["call", "lib/app.rb", 15, at("  JSON.load(text)", "JSON"), "json.JSON.load"]]);
});

test("rake and rackup files are scanned, and vendor, fixtures, and a receiver method named load are not", async () => {
  const found = await usages(
    {
      "config.ru": 'require "json"\n',
      "tasks/load.rake": 'require "json"\n',
      "vendor/bundle/json.rb": 'require "json"\nJSON.parse(x)\n',
      "fixtures/sample.rb": 'require "json"\n',
      "lib/app.rb": 'JSON.load("x")\n',
    },
    "json",
    ["JSON.parse"],
  );
  assert.deepEqual(found, [
    ["import", "config.ru", 1, at('require "json"', "json"), "json"],
    ["import", "tasks/load.rake", 1, at('require "json"', "json"), "json"],
  ]);
});

test("ruby matchers are valid, and a yanked gem finding lists source files in the scan and the migration packet", async () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "ruby", module: "json" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "ruby", module: "json", targets: ["JSON.parse"] }), true);
  const root = await repository({
    "Gemfile.lock": "GEM\n  remote: https://rubygems.org/\n  specs:\n    json (2.17.1.1)\n",
    "lib/app.rb": ['require "json"', "def run(text)", "  JSON.parse(text)", "end"].join("\n"),
    "lib/alias.rb": ["Parser = JSON", "def run(text)", "  Parser.generate(text)", "end"].join("\n"),
    "lib/dynamic.rb": ["def run(name)", "  require name", "end"].join("\n"),
  });
  const result = await scanRepository(root, [new RubyDetector()]);
  const finding = result.findings.find((item) => item.ruleId === "ruby.gem.json.yanked-2.17.1.1")!;
  assert.deepEqual(
    finding.usages?.map((usage) => [usage.kind, usage.location.path, usage.location.line]),
    [
      ["call", "lib/alias.rb", 3],
      ["import", "lib/app.rb", 1],
      ["call", "lib/app.rb", 3],
    ],
  );
  assert.deepEqual(finding.impact, { usageCount: 3, affectedFiles: 2, level: "low" });
  assert.match(renderText(result), /Impact: low \(3 usages across 2 files\)/);
  assert.match(renderText(result), /Unclassified: 1 pinned reference/);
  assert.deepEqual(result.unclassified?.references.map((reference) => [reference.location.path, reference.location.line, reference.reference]), [["lib/dynamic.rb", 2, "require name"]]);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual([...packet.affectedFiles].sort(), ["Gemfile.lock", "lib/alias.rb", "lib/app.rb"]);
});

test("dynamic require, load, gem, autoload, and require_relative are unclassified, and literals are not", async () => {
  const root = await repository({
    Gemfile: 'source "https://rubygems.org"\n',
    "lib/app.rb": [
      "def run(name, path, gem_name, file)",
      "  require name",
      '  require("libs/#{name}")',
      "  load path",
      "  gem gem_name",
      "  autoload :JSON, file",
      "  require_relative path",
      "  Kernel.require name",
      '  require "json"',
      '  # require name',
      '  example = "require name"',
      "end",
    ].join("\n"),
  });
  const result = await scanRepository(root, [new RubyDetector()]);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(
    result.unclassified?.references.map((reference) => reference.reference),
    [
      "require name",
      'require("libs/#{name}")',
      "load path",
      "gem gem_name",
      "autoload :JSON, file",
      "require_relative path",
      "Kernel.require name",
    ],
  );
});
