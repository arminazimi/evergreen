import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { PhpDetector } from "../src/detectors/php/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import { renderText } from "../src/reporters.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage, findPhpDynamicReferences } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-php-usage-"));
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
      { kind: "import" as const, language: "php" as const, module },
      ...(targets.length > 0 ? [{ kind: "call" as const, language: "php" as const, module, targets }] : []),
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

test("reports quoted require and include paths, use names, use function, use const, and one-level group uses", async () => {
  const lines = [
    'require "Foo"',
    "require_once 'Foo/extra.php'",
    'include "Foo/file.php"',
    "include_once 'Foo/once.php'",
    "require('Foo.php')",
    "use Foo\\Bar;",
    "use Foo\\Bar as Alias;",
    "use function Foo\\bar_func;",
    "use const Foo\\BAR_CONST;",
    "use Foo\\{Baz, Qux as Quux};",
    "use function Foo\\{bar_fn, baz_fn as qux_fn};",
    "use const Foo\\{CONST_A, CONST_B as CONST_C};",
    "use Foo\\{Bar\\{Baz}};",
  ];
  const found = await usages({ "lib/app.php": lines.join("\n") }, "Foo", []);
  assert.deepEqual(found, [
    ["import", "lib/app.php", 1, at(lines[0]!, "Foo"), "Foo"],
    ["import", "lib/app.php", 2, at(lines[1]!, "Foo/extra.php"), "Foo"],
    ["import", "lib/app.php", 3, at(lines[2]!, "Foo/file.php"), "Foo"],
    ["import", "lib/app.php", 4, at(lines[3]!, "Foo/once.php"), "Foo"],
    ["import", "lib/app.php", 5, at(lines[4]!, "Foo.php"), "Foo"],
    ["import", "lib/app.php", 6, at(lines[5]!, "Foo\\Bar"), "Foo"],
    ["import", "lib/app.php", 7, at(lines[6]!, "Foo\\Bar"), "Foo"],
    ["import", "lib/app.php", 8, at(lines[7]!, "Foo\\bar_func"), "Foo"],
    ["import", "lib/app.php", 9, at(lines[8]!, "Foo\\BAR_CONST"), "Foo"],
    ["import", "lib/app.php", 10, at(lines[9]!, "Baz"), "Foo"],
    ["import", "lib/app.php", 10, at(lines[9]!, "Qux"), "Foo"],
    ["import", "lib/app.php", 11, at(lines[10]!, "bar_fn"), "Foo"],
    ["import", "lib/app.php", 11, at(lines[10]!, "baz_fn"), "Foo"],
    ["import", "lib/app.php", 12, at(lines[11]!, "CONST_A"), "Foo"],
    ["import", "lib/app.php", 12, at(lines[11]!, "CONST_B"), "Foo"],
  ]);
});

test("reports calls spelled Swift_Mailer::newInstance and new Swift_Mailer, including an alias of an alias", async () => {
  const lines = [
    "use Swift_Mailer as Mailer;",
    "use Mailer as Sender;",
    "new Sender($transport);",
    "Sender::newInstance($transport);",
    "new Swift_Mailer($transport);",
    "Swift_Mailer::newInstance($transport);",
  ];
  const found = await usages({ "lib/app.php": lines.join("\n") }, "Swift_Mailer", ["new Swift_Mailer", "Swift_Mailer::newInstance"]);
  assert.deepEqual(
    found.filter((item) => item[0] === "call"),
    [
      ["call", "lib/app.php", 3, at(lines[2]!, "new"), "Swift_Mailer.new Swift_Mailer"],
      ["call", "lib/app.php", 4, at(lines[3]!, "Sender"), "Swift_Mailer.Swift_Mailer::newInstance"],
      ["call", "lib/app.php", 5, at(lines[4]!, "new"), "Swift_Mailer.new Swift_Mailer"],
      ["call", "lib/app.php", 6, at(lines[5]!, "Swift_Mailer"), "Swift_Mailer.Swift_Mailer::newInstance"],
    ],
  );
});

test("reports calls spelled Zend\\Stdlib\\ArrayUtils::merge and new Zend\\Stdlib\\Parameters, including a namespace alias", async () => {
  const lines = [
    "use Zend\\Stdlib\\ArrayUtils as Utils;",
    "use Utils as Lists;",
    "Lists::merge($left, $right);",
    "new Lists();",
    "Zend\\Stdlib\\ArrayUtils::merge($left, $right);",
    "\\Zend\\Stdlib\\ArrayUtils::merge($left, $right);",
    "new \\Zend\\Stdlib\\Parameters();",
    "use Zend\\Stdlib as Stdlib;",
    "Stdlib\\ArrayUtils::merge($left, $right);",
    "new Stdlib\\Parameters();",
    "use Zend\\Stdlib\\ArrayUtils;",
    "ArrayUtils::merge($left, $right);",
  ];
  const found = await usages({ "lib/app.php": lines.join("\n") }, "Zend\\Stdlib", [
    "Zend\\Stdlib\\ArrayUtils::merge",
    "new Zend\\Stdlib\\ArrayUtils",
    "new Zend\\Stdlib\\Parameters",
  ]);
  assert.deepEqual(
    found.filter((item) => item[0] === "call"),
    [
      ["call", "lib/app.php", 3, at(lines[2]!, "Lists"), "Zend\\Stdlib.Zend\\Stdlib\\ArrayUtils::merge"],
      ["call", "lib/app.php", 4, at(lines[3]!, "new"), "Zend\\Stdlib.new Zend\\Stdlib\\ArrayUtils"],
      ["call", "lib/app.php", 5, at(lines[4]!, "Zend\\Stdlib\\ArrayUtils"), "Zend\\Stdlib.Zend\\Stdlib\\ArrayUtils::merge"],
      ["call", "lib/app.php", 6, at(lines[5]!, "Zend\\Stdlib\\ArrayUtils"), "Zend\\Stdlib.Zend\\Stdlib\\ArrayUtils::merge"],
      ["call", "lib/app.php", 7, at(lines[6]!, "new"), "Zend\\Stdlib.new Zend\\Stdlib\\Parameters"],
      ["call", "lib/app.php", 9, at(lines[8]!, "Stdlib\\ArrayUtils"), "Zend\\Stdlib.Zend\\Stdlib\\ArrayUtils::merge"],
      ["call", "lib/app.php", 10, at(lines[9]!, "new"), "Zend\\Stdlib.new Zend\\Stdlib\\Parameters"],
      ["call", "lib/app.php", 12, at(lines[11]!, "ArrayUtils"), "Zend\\Stdlib.Zend\\Stdlib\\ArrayUtils::merge"],
    ],
  );
  assert.deepEqual(
    found.filter((item) => item[0] === "import").map((item) => item[2]),
    [1, 8, 11],
  );
});

test("does not treat comments, strings, heredocs, nowdocs, or a closure use as usages", async () => {
  const lines = [
    "<?php",
    '// require "Swift_Mailer";',
    "# new Swift_Mailer();",
    "/* Swift_Mailer::newInstance();",
    "new Swift_Mailer();",
    "*/",
    '$message = "new Swift_Mailer()";',
    '$span = "new Swift_Mailer()',
    '";',
    "$now = <<<EOT",
    "new Swift_Mailer();",
    "Swift_Mailer::newInstance();",
    "EOT;",
    "$plain = <<<'NOW'",
    'require "Swift_Mailer";',
    "NOW;",
    "$fn = function ($value) use ($outside) {",
    "    return $outside;",
    "};",
    "#[Deprecated] new Swift_Mailer($transport);",
  ];
  const found = await usages({ "lib/app.php": lines.join("\n"), "notes.txt": 'require "Swift_Mailer"\n' }, "Swift_Mailer", ["new Swift_Mailer", "Swift_Mailer::newInstance"]);
  assert.deepEqual(found, [["call", "lib/app.php", 20, at(lines[19]!, "new"), "Swift_Mailer.new Swift_Mailer"]]);
  assert.deepEqual(await findPhpDynamicReferences(await repository({ "lib/app.php": lines.join("\n") })), []);
});

test("vendor and fixture trees are skipped, and only .php files are read", async () => {
  const found = await usages(
    {
      "src/app.php": "new Swift_Mailer($transport);\n",
      "vendor/mail.php": "new Swift_Mailer($transport);\nrequire \"Swift_Mailer\";\n",
      "fixtures/sample.php": "require \"Swift_Mailer\";\n",
      "src/app.inc": "new Swift_Mailer($transport);\n",
    },
    "Swift_Mailer",
    ["new Swift_Mailer"],
  );
  assert.deepEqual(found, [["call", "src/app.php", 1, at("new Swift_Mailer($transport);", "new"), "Swift_Mailer.new Swift_Mailer"]]);
});

test("dynamic require, include, new $class, and $class::method are unclassified, not usages", async () => {
  const lines = [
    "require $path",
    "require_once($file)",
    "include $path",
    "include_once $file",
    'require "{$dir}/file.php"',
    'require "a" . "b"',
    "new $class",
    "$class::method()",
    'require "Swift_Mailer"',
    "use Swift_Mailer;",
    "// require $path",
    '$message = "require $path";',
    "new Swift_Mailer();",
    'require_relative "Swift_Mailer"',
  ];
  const root = await repository({ "lib/app.php": lines.join("\n") });
  const found = await analyzeSourceUsage(root, contract("Swift_Mailer", ["new Swift_Mailer"]));
  assert.deepEqual(
    found[0]!.usages.map((usage) => [usage.kind, usage.location.line]),
    [
      ["import", 9],
      ["import", 10],
      ["call", 13],
    ],
  );
  assert.deepEqual(
    (await findPhpDynamicReferences(root)).map((item) => [item.line, item.column, item.reference]),
    [
      [1, at(lines[0]!, "require"), "require $path"],
      [2, at(lines[1]!, "require_once"), "require_once($file)"],
      [3, at(lines[2]!, "include"), "include $path"],
      [4, at(lines[3]!, "include_once"), "include_once $file"],
      [5, at(lines[4]!, "require"), 'require "{$dir}/file.php"'],
      [6, at(lines[5]!, "require"), 'require "a" . "b"'],
      [7, at(lines[6]!, "new"), "new $class"],
      [8, at(lines[7]!, "$class"), "$class::method("],
    ],
  );
});

test("php matchers are valid, and an abandoned package finding lists source files in the scan and the migration packet", async () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "php", module: "Swift_Mailer" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "php", module: "Swift_Mailer", targets: ["new Swift_Mailer"] }), true);
  const rules = validateRegistryV2(JSON.parse(await readFile("registry/php.json", "utf8"))).rules;
  assert.equal(rules.find((rule) => rule.id === "php.runtime.eol-7.4")!.usage, undefined);
  assert.deepEqual(rules.find((rule) => rule.id === "php.package.swiftmailer.swiftmailer.abandoned")!.usage, [
    { kind: "import", language: "php", module: "Swift_Mailer" },
    { kind: "import", language: "php", module: "Swift_Message" },
    { kind: "call", language: "php", module: "Swift_Mailer", targets: ["new Swift_Mailer", "Swift_Mailer::newInstance"] },
    { kind: "call", language: "php", module: "Swift_Message", targets: ["new Swift_Message", "Swift_Message::newInstance"] },
  ]);
  assert.deepEqual(rules.find((rule) => rule.id === "php.package.zendframework.zend-stdlib.abandoned")!.usage, [
    { kind: "import", language: "php", module: "Zend\\Stdlib" },
    { kind: "call", language: "php", module: "Zend\\Stdlib", targets: ["Zend\\Stdlib\\ArrayUtils::merge", "new Zend\\Stdlib\\Parameters"] },
  ]);

  const root = await repository({
    "composer.json": '{\n  "require": {\n    "swiftmailer/swiftmailer": "^6.2"\n  }\n}\n',
    "src/app.php": ["<?php", "use Swift_Mailer;", "new Swift_Mailer($transport);"].join("\n"),
    "src/alias.php": ["<?php", "use Swift_Message as Message;", "Message::newInstance('Hi');"].join("\n"),
    "src/dynamic.php": ["<?php", "require $path;", "new $mailer;"].join("\n"),
  });
  const result = await scanRepository(root, [new PhpDetector()]);
  const finding = result.findings.find((item) => item.ruleId === "php.package.swiftmailer.swiftmailer.abandoned")!;
  assert.deepEqual(
    finding.usages?.map((usage) => [usage.kind, usage.location.path, usage.location.line]),
    [
      ["import", "src/alias.php", 2],
      ["call", "src/alias.php", 3],
      ["import", "src/app.php", 2],
      ["call", "src/app.php", 3],
    ],
  );
  assert.deepEqual(finding.impact, { usageCount: 4, affectedFiles: 2, level: "medium" });
  const text = renderText(result);
  assert.match(text, /Impact: medium \(4 usages across 2 files\)/);
  assert.match(text, /Usage: src\/alias\.php:2 — import Swift_Message/);
  assert.match(text, /Usage: src\/alias\.php:3 — call Swift_Message\.Swift_Message::newInstance/);
  assert.match(text, /Usage: src\/app\.php:3 — call Swift_Mailer\.new Swift_Mailer/);
  assert.match(text, /Unclassified: 2 pinned references/);
  assert.deepEqual(
    result.unclassified?.references.map((reference) => [reference.location.path, reference.location.line, reference.reference]),
    [
      ["src/dynamic.php", 2, "require $path;"],
      ["src/dynamic.php", 3, "new $mailer"],
    ],
  );
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual([...packet.affectedFiles].sort(), ["composer.json", "src/alias.php", "src/app.php"]);
  const usageStep = packet.steps.find((step) => step.targets === "usages");
  assert.deepEqual(usageStep?.paths, ["src/alias.php", "src/app.php"]);
});

test("dynamic references are omitted when no usage-matched finding exists", async () => {
  const root = await repository({
    ".php-version": "7.4.33\n",
    "src/app.php": "require $path;\n",
  });
  const result = await scanRepository(root, [new PhpDetector()]);
  assert.ok(result.findings.some((item) => item.ruleId === "php.runtime.eol-7.4"));
  assert.deepEqual(result.unclassified?.references ?? [], []);
});

test("a require on a line longer than 4096 characters is unclassified, and a normal line still matches", async () => {
  const long = `${" ".repeat(4100)}require $path`;
  assert.ok(long.length > 4096);
  const root = await repository({
    "lib/long.php": long,
    "lib/normal.php": "require 'Swift_Mailer';\n",
  });
  const [analysis] = await analyzeSourceUsage(root, contract("Swift_Mailer", []));
  const dynamic = await findPhpDynamicReferences(root);
  assert.deepEqual(
    analysis!.usages.map((usage) => [usage.location.path, usage.location.line]),
    [["lib/normal.php", 1]],
  );
  assert.deepEqual(
    dynamic.map((item) => [item.path, item.line, item.column, item.reason]),
    [["lib/long.php", 1, 1, "line longer than 4096 characters"]],
  );
});

test("cyclic aliases and a long alias chain finish without throwing", async () => {
  const chain = ["use Swift_Mailer as A0;", ...Array.from({ length: 12 }, (_, index) => `use A${index} as A${index + 1};`), "A1::newInstance($transport);"].join("\n");
  const found = await usages(
    {
      "lib/cycle.php": "use A as B;\nuse B as A;\nB::newInstance($transport);\n",
      "lib/chain.php": chain,
    },
    "Swift_Mailer",
    ["Swift_Mailer::newInstance"],
  );
  assert.deepEqual(found.filter((item) => item[0] === "call"), [
    ["call", "lib/chain.php", 14, at("A1::newInstance($transport);", "A1"), "Swift_Mailer.Swift_Mailer::newInstance"],
  ]);
});

test("alias and receiver tables stop at a fixed size", async () => {
  const receivers = Array.from({ length: 70 }, (_, index) => `use Swift_Mailer as M${index};`).join("\n");
  const receiverFile = `${receivers}\nM0::newInstance($transport);\nM69::newInstance($transport);\n`;
  const aliases = Array.from({ length: 300 }, (_, index) => `use Swift_Mailer as N${index};`).join("\n");
  const aliasFile = `${aliases}\nN0::newInstance($transport);\nN299::newInstance($transport);\n`;
  const found = await usages(
    { "lib/receivers.php": receiverFile, "lib/aliases.php": aliasFile },
    "Swift_Mailer",
    ["Swift_Mailer::newInstance"],
  );
  assert.deepEqual(
    found.filter((item) => item[0] === "call").map((item) => [item[1], item[2]]),
    [
      ["lib/aliases.php", 301],
      ["lib/receivers.php", 71],
    ],
  );
  assert.equal(found.filter((item) => item[0] === "import" && item[1] === "lib/aliases.php").length, 256);
  assert.equal(found.filter((item) => item[0] === "import" && item[1] === "lib/receivers.php").length, 70);
});
