import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { GO_MODULE_CANDIDATES, goModUrl, goModuleDeprecationImporter, latestUrl } from "../../tools/importers/go-2.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/go-2.json");

test("drafts rules from real latest go.mod deprecation comments", async () => {
  const drafts = await execute(goModuleDeprecationImporter, { replay: recording });
  assert.equal(drafts.rules.length, GO_MODULE_CANDIDATES.length);
  const protobuf = drafts.rules.find((rule) => rule.purl === "pkg:golang/github.com/golang/protobuf")!;
  assert.equal(protobuf.id, "go.module.github.com.golang.protobuf.deprecated");
  assert.equal(protobuf.vers, "vers:golang/*");
  assert.equal(protobuf.event, "deprecated");
  assert.equal(protobuf.replacement, "google.golang.org/protobuf");
  assert.match(protobuf.summary, /Use the "google\.golang\.org\/protobuf" module instead/);
  assert.equal(protobuf.provenance.importer, "go-2");
  assert.equal(protobuf.provenance.observedAt, "2026-10-16");
});

test("recorded drafts match the reviewed rules and never mutate the Go registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/go.json"), "utf8")) as RegistryV2;
  const before = JSON.stringify(registry);
  const drafts = await execute(goModuleDeprecationImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.unchanged.length, GO_MODULE_CANDIDATES.length);
  assert.deepEqual([diff.changed, diff.removed, diff.duplicates], [[], [], []]);
  assert.equal(JSON.stringify(registry), before);
});

test("only a Deprecated paragraph adjacent to the module directive is authoritative", async () => {
  const candidate = GO_MODULE_CANDIDATES[0]!;
  const version = "v1.2.3";
  const context: ImporterContext = {
    now: new Date("2026-10-16T12:00:00Z"),
    async fetchText(url) {
      if (url === "https://go.dev/ref/mod") return '<h4 id="go-mod-file-module-deprecation">Deprecated:</h4>';
      if (url === latestUrl(candidate)) return JSON.stringify({ Version: version });
      if (url === goModUrl(candidate, version)) return "// Deprecated: use example.com/new/module instead.\n// Continue migration there.\nmodule example.com/old/module\n";
      if (url.endsWith("/@latest")) return JSON.stringify({ Version: version });
      return "// Deprecated: mentioned elsewhere, not the module declaration.\n\nmodule example.com/active\n";
    },
  };
  const drafts = await runImporter(goModuleDeprecationImporter, context);
  assert.equal(drafts.rules.length, 1);
  assert.equal(drafts.rules[0]!.replacement, "example.com/new/module");
  assert.match(drafts.rules[0]!.summary, /Continue migration there/);
  assert.match(drafts.notes[0]!, /^No Deprecated comment at @latest:/);
});

test("a changed policy page fails closed instead of guessing deprecations", async () => {
  const result = await runImporter(goModuleDeprecationImporter, {
    now: new Date("2026-10-16T12:00:00Z"),
    fetchText: async () => "<html>reference moved</html>",
  });
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["The Go module reference no longer describes module deprecation comments; no drafts were produced."]);
});
