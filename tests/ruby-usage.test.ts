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
import { analyzeSourceUsage, findRubyDynamicReferences } from "../src/source-usage.js";

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

test("dynamic require, load, gem, and autoload are unclassified; literals and require_relative are not", async () => {
  const root = await repository({
    Gemfile: 'source "https://rubygems.org"\n',
    "Gemfile.lock": "GEM\n  remote: https://rubygems.org/\n  specs:\n    json (2.17.1.1)\n",
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
  assert.ok(result.findings.some((item) => item.ruleId === "ruby.gem.json.yanked-2.17.1.1"));
  assert.deepEqual(
    result.unclassified?.references.map((reference) => reference.reference),
    [
      "require name",
      'require("libs/#{name}")',
      "load path",
      "gem gem_name",
      "autoload :JSON, file",
      "Kernel.require name",
    ],
  );
});

test("large alias files and cyclic chains finish quickly without throwing", async () => {
  const manyAliases = Array.from({ length: 30_000 }, (_, index) => `A${index} = JSON`).join("\n") + "\nA1.parse(x)\n";
  const aliasRoot = await repository({ "lib/aliases.rb": manyAliases });
  const startedAliases = performance.now();
  const aliasUsages = await analyzeSourceUsage(aliasRoot, contract("json", ["JSON.parse"]));
  const aliasMs = performance.now() - startedAliases;
  assert.ok(aliasMs < 1000, `alias scan took ${aliasMs}ms`);
  assert.ok(aliasUsages[0]!.usages.some((usage) => usage.kind === "call" && usage.location.line === 30_001));

  const chain = Array.from({ length: 20_000 }, (_, index) => (index === 0 ? "A0 = JSON" : `A${index} = A${index - 1}`)).join("\n");
  const cycle = "A = B\nB = A\n";
  const chainRoot = await repository({ "lib/chain.rb": chain, "lib/cycle.rb": cycle });
  const startedChain = performance.now();
  await analyzeSourceUsage(chainRoot, contract("json", ["JSON.parse"]));
  const chainMs = performance.now() - startedChain;
  assert.ok(chainMs < 1000, `chain/cycle scan took ${chainMs}ms`);
});

test("very long require lines are skipped quickly; a normal line still matches", async () => {
  const longJson = ("require 'json'; ".repeat(40_000));
  assert.ok(longJson.length > 600_000);
  const longDynamic = ("require x; ".repeat(20_000));
  const root = await repository({
    "lib/long.rb": longJson,
    "lib/long-dynamic.rb": longDynamic,
    "lib/normal.rb": "require 'json'\n",
  });
  const started = performance.now();
  const [analysis] = await analyzeSourceUsage(root, contract("json", []));
  const dynamic = await findRubyDynamicReferences(root);
  const ms = performance.now() - started;
  assert.ok(ms < 1000, `long-line scan took ${ms}ms`);
  assert.deepEqual(
    analysis!.usages.map((usage) => [usage.location.path, usage.location.line, usage.location.column]),
    [["lib/normal.rb", 1, at("require 'json'", "json")]],
  );
  assert.deepEqual(
    dynamic.map((item) => [item.path, item.line, item.column, item.reason]),
    [
      ["lib/long-dynamic.rb", 1, 1, "line longer than 4096 characters"],
      ["lib/long.rb", 1, 1, "line longer than 4096 characters"],
    ],
  );
});

test("false require/load/gem lookalikes are not unclassified; real dynamic forms still are", async () => {
  const root = await repository({
    "lib/noise.rb": [
      "gem = Gem::Specification.load(x)",
      "puts gem.name",
      "opts = { load: true, require: false }",
      "x = load",
      "require_relative File.expand_path('x', __dir__)",
    ].join("\n"),
    "lib/real.rb": ["require name", "require File.join(a, b)", "autoload(:Bar, bar_path)"].join("\n"),
  });
  const found = await findRubyDynamicReferences(root);
  assert.deepEqual(
    found.map((item) => [item.path, item.line, item.column, item.reference]),
    [
      ["lib/real.rb", 1, 1, "require name"],
      ["lib/real.rb", 2, 1, "require File.join(a, b)"],
      ["lib/real.rb", 3, 1, "autoload(:Bar, bar_path)"],
    ],
  );
});

test("oversized require lines and data after __END__ are not silent", async () => {
  const long = " ".repeat(4100) + 'require "json"';
  const [longAnalysis] = await analyzeSourceUsage(await repository({ "lib/app.rb": long }), contract("json", ["JSON.parse"]));
  const longSkips = await findRubyDynamicReferences(await repository({ "lib/app.rb": long }));
  assert.deepEqual(longAnalysis!.usages, []);
  assert.equal(longSkips.length, 1);
  assert.equal(longSkips[0]!.line, 1);
  assert.equal(longSkips[0]!.column, 1);
  assert.match(longSkips[0]!.reason, /line longer than 4096 characters/);

  const afterEnd = await usages({ "lib/app.rb": 'puts 1\n__END__\nrequire "json"' }, "json", ["JSON.parse"]);
  assert.deepEqual(afterEnd, []);
  assert.deepEqual(await findRubyDynamicReferences(await repository({ "lib/app.rb": 'puts 1\n__END__\nrequire "json"' })), []);
});

test("multi-line string literals are not scanned as code", async () => {
  const found = await usages({ "lib/app.rb": "s = 'a\nrequire \"json\"\nb'" }, "json", ["JSON.parse"]);
  assert.deepEqual(found, []);
  assert.deepEqual(await findRubyDynamicReferences(await repository({ "lib/app.rb": "s = 'a\nrequire \"json\"\nb'" })), []);
});

test("character literals and regexp literals do not hide requires on the same line", async () => {
  const charLine = 'c = ?"; require "json"';
  const regexLine = 'x = /"/; require "json"';
  const charFound = await usages({ "lib/app.rb": charLine }, "json", []);
  const regexFound = await usages({ "lib/app.rb": regexLine }, "json", []);
  assert.deepEqual(charFound, [["import", "lib/app.rb", 1, at(charLine, "json"), "json"]]);
  assert.deepEqual(regexFound, [["import", "lib/app.rb", 1, at(regexLine, "json"), "json"]]);
});

test("dynamic references are omitted when no usage-matched finding exists", async () => {
  const root = await repository({
    Gemfile: 'source "https://rubygems.org"\ngem "rails", "7.1.0"\n',
    "lib/app.rb": 'require File.expand_path("x", __dir__)\n',
  });
  const result = await scanRepository(root, [new RubyDetector()]);
  assert.deepEqual(result.unclassified?.references ?? [], []);
});
