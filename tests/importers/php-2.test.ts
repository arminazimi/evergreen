import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { PHP_PACKAGE_CANDIDATES } from "../../tools/importers/php-candidates.js";
import {
  COMPOSER_PACKAGE_NAME,
  abandonedRuleId,
  importAbandonedPackages,
  metadataUrl,
  packagePageUrl,
  phpPackagistAbandonedImporter,
} from "../../tools/importers/php-2.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/php-2.json");

function metadata(name: string, versions: unknown[]): unknown {
  return { packages: { [name]: versions } };
}

function context(files: Record<string, unknown>): ImporterContext {
  return {
    now: new Date("2026-10-20T12:00:00Z"),
    async fetchText(url, options) {
      assert.equal(options?.accept, "application/json");
      const value = files[url];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

/** Every candidate, with `abandoned` omitted unless a file overrides that package. */
function activeFiles(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const name of PHP_PACKAGE_CANDIDATES) {
    files[metadataUrl(name)] = overrides[name] ?? metadata(name, [{ name, version: "1.0.0" }]);
  }
  return files;
}

test("the candidate list is sorted, distinct, and holds Composer package names", () => {
  assert.deepEqual([...PHP_PACKAGE_CANDIDATES], [...new Set(PHP_PACKAGE_CANDIDATES)].sort());
  for (const name of PHP_PACKAGE_CANDIDATES) assert.match(name, COMPOSER_PACKAGE_NAME);
});

test("drafts abandoned rules from the real recording, including a flag with no replacement", async () => {
  const drafts = await execute(phpPackagistAbandonedImporter, { replay: recording });
  assert.equal(drafts.observedAt, "2026-10-20");
  assert.equal(drafts.rules.length, PHP_PACKAGE_CANDIDATES.length - 1);

  const swift = drafts.rules.find((rule) => rule.id === "php.package.swiftmailer.swiftmailer.abandoned")!;
  assert.equal(swift.purl, "pkg:composer/swiftmailer/swiftmailer");
  assert.equal(swift.vers, "vers:composer/*");
  assert.equal(swift.event, "deprecated");
  assert.equal(swift.title, "swiftmailer/swiftmailer is abandoned");
  assert.equal(
    swift.summary,
    "Packagist marks swiftmailer/swiftmailer as abandoned and no longer maintained, and the author suggests using symfony/mailer instead.",
  );
  assert.equal(swift.severity, "high");
  assert.equal(swift.replacement, "symfony/mailer");
  assert.equal(swift.deadline, undefined);
  assert.deepEqual(swift.sources, [
    { title: "swiftmailer/swiftmailer on Packagist", url: packagePageUrl("swiftmailer/swiftmailer") },
    { title: "swiftmailer/swiftmailer Composer metadata", url: metadataUrl("swiftmailer/swiftmailer") },
  ]);
  assert.deepEqual(swift.provenance, {
    observedAt: "2026-10-20",
    reviewedAt: "2026-10-20",
    reviewer: "pending-review",
    importer: "php-2",
  });

  const zend = drafts.rules.find((rule) => rule.id === "php.package.zendframework.zend-stdlib.abandoned")!;
  assert.equal(zend.replacement, "laminas/laminas-stdlib");
  assert.equal(zend.purl, "pkg:composer/zendframework/zend-stdlib");

  const faker = drafts.rules.find((rule) => rule.id === "php.package.fzaninotto.faker.abandoned")!;
  assert.equal(faker.replacement, undefined);
  assert.equal(faker.summary, "Packagist marks fzaninotto/faker as abandoned and no longer maintained.");

  const checker = drafts.rules.find((rule) => rule.id === "php.package.sensiolabs.security-checker.abandoned")!;
  assert.equal(checker.replacement, "https://github.com/fabpot/local-php-security-checker");
  assert.match(checker.summary, /points to https:\/\/github.com\/fabpot\/local-php-security-checker/);

  assert.deepEqual(drafts.notes, [
    "Not abandoned on Packagist, so no rule (remove them from PHP_PACKAGE_CANDIDATES if they stay that way): monolog/monolog.",
  ]);
});

test("recorded drafts diff against the curated rules and never write the registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/php.json"), "utf8")) as RegistryV2;
  const before = JSON.stringify(registry);
  const diff = diffDrafts(await execute(phpPackagistAbandonedImporter, { replay: recording }), registry);

  assert.deepEqual(diff.added.map((rule) => rule.id), [
    "php.package.doctrine.cache.abandoned",
    "php.package.fzaninotto.faker.abandoned",
    "php.package.sensiolabs.security-checker.abandoned",
  ]);
  assert.deepEqual(diff.changed.map((entry) => entry.id), [
    "php.package.swiftmailer.swiftmailer.abandoned",
    "php.package.zendframework.zend-stdlib.abandoned",
  ]);
  const swift = diff.changed[0]!;
  assert.deepEqual(swift.dates, []);
  assert.ok(swift.fields.some((change) => change.field === "summary"));
  assert.ok(!swift.fields.some((change) => change.field === "replacement" || change.field === "severity"));
  assert.ok(swift.sources?.added.some((source) => source.url === metadataUrl("swiftmailer/swiftmailer")));
  assert.ok(swift.sources?.removed.some((source) => source.url === "https://symfony.com/blog/the-end-of-swiftmailer"));
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.unchanged, []);
  assert.deepEqual(diff.duplicates, []);
  assert.ok(!diff.added.some((rule) => rule.id.startsWith("php.runtime.")));
  assert.equal(JSON.stringify(registry), before);
});

test("a string flag names the replacement, true does not, and a missing flag is a note", async () => {
  const [abandoned, bare, active, ...rest] = PHP_PACKAGE_CANDIDATES;
  const files = activeFiles({
    [abandoned!]: metadata(abandoned!, [{ version: "2.0.0" }, { version: "1.0.0", abandoned: "vendor/next" }]),
    [bare!]: metadata(bare!, [{ version: "1.0.0", abandoned: true }]),
    [active!]: metadata(active!, [{ version: "1.0.0", abandoned: false }]),
  });
  const result = await runImporter(phpPackagistAbandonedImporter, context(files));
  assert.deepEqual(
    result.rules.map((rule) => [rule.id, rule.replacement ?? null]),
    [
      [abandonedRuleId(abandoned!), "vendor/next"],
      [abandonedRuleId(bare!), null],
    ],
  );
  assert.equal(result.rules[0]!.summary, `Packagist marks ${abandoned} as abandoned and no longer maintained, and the author suggests using vendor/next instead.`);
  assert.deepEqual(result.notes, [
    `Not abandoned on Packagist, so no rule (remove them from PHP_PACKAGE_CANDIDATES if they stay that way): ${[active, ...rest].join(", ")}.`,
  ]);
});

test("skips a conflict, an unusable flag, a missing version list, and a name Packagist does not know", async () => {
  const [conflict, unusable, missing, absent, ...rest] = PHP_PACKAGE_CANDIDATES;
  const files = activeFiles({
    [conflict!]: metadata(conflict!, [{ abandoned: true }, { abandoned: "vendor/other" }]),
    [unusable!]: metadata(unusable!, [{ abandoned: "" }]),
    [missing!]: { packages: {} },
  });
  delete files[metadataUrl(absent!)];
  const result = await runImporter(phpPackagistAbandonedImporter, context(files));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, [
    `Skipped ${conflict}: versions disagree about the abandoned flag.`,
    `Skipped ${unusable}: the abandoned flag is not true or a replacement string.`,
    `Skipped ${missing}: Packagist metadata has no version list.`,
    `Skipped ${absent}: not found on Packagist.`,
    `Not abandoned on Packagist, so no rule (remove them from PHP_PACKAGE_CANDIDATES if they stay that way): ${rest.join(", ")}.`,
  ]);
});

test("an invalid package name is a note, and a non-404 failure stops the run", async () => {
  const noted = await importAbandonedPackages(context({}), ["Not A Package", "monolog/monolog"]);
  assert.deepEqual(noted.rules, []);
  assert.deepEqual(noted.notes, [
    "Skipped Not A Package: not a valid Composer package name.",
    "Skipped monolog/monolog: not found on Packagist.",
  ]);

  const broken = context({
    [metadataUrl(PHP_PACKAGE_CANDIDATES[0]!)]: new ImporterError(`GET ${metadataUrl(PHP_PACKAGE_CANDIDATES[0]!)} failed: HTTP 503`),
  });
  await assert.rejects(runImporter(phpPackagistAbandonedImporter, broken), /HTTP 503/);
  await assert.rejects(
    runImporter(phpPackagistAbandonedImporter, context({ [metadataUrl(PHP_PACKAGE_CANDIDATES[0]!)]: "not json" })),
    /not valid JSON/,
  );
});
