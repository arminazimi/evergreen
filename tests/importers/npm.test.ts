import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { NPM_CANDIDATES } from "../../tools/importers/npm-candidates.js";
import { NPM_NAME, npmDeprecatedImporter, registryUrl, ruleSlug } from "../../tools/importers/npm.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/npm-deprecated.json");

function registry(responses: Record<string, unknown>): ImporterContext {
  return {
    now: new Date("2026-10-15T12:00:00Z"),
    async fetchText(url) {
      const response = responses[url] ?? (!url.endsWith("/latest") && responses[`${url}/latest`] && !(responses[`${url}/latest`] instanceof Error)
        ? { versions: { "1.0.0": responses[`${url}/latest`] } } : undefined);
      if (response === undefined) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      if (response instanceof Error) throw response;
      return JSON.stringify(response);
    },
  };
}

test("drafts a deprecated rule for every candidate whose latest version carries a notice, from the recording", async () => {
  const drafts = await execute(npmDeprecatedImporter, { replay: recording });
  assert.equal(drafts.rules.length, NPM_CANDIDATES.length);
  const request = drafts.rules.find((rule) => rule.id === "npm.package.request.deprecated")!;
  assert.equal(request.purl, "pkg:npm/request");
  assert.ok(request.vers.startsWith("vers:npm/"));
  assert.ok(!request.vers.includes("*"));
  assert.equal(request.event, "deprecated");
  assert.equal(request.title, "request is deprecated");
  assert.equal(request.summary, 'npm marks request as deprecated: "request has been deprecated, see https://github.com/request/request/issues/3142"');
  assert.deepEqual(request["x-npm"], { package: "request" });
  assert.deepEqual(request.sources, [
    { title: "request on npm", url: "https://www.npmjs.com/package/request" },
    { title: "request registry metadata", url: "https://registry.npmjs.org/request" },
  ]);
  assert.equal(request.deadline, undefined, "npm records no deprecation date");
  assert.deepEqual(drafts.notes, []);
});

test("scoped packages get a scoped PURL, an encoded registry URL, and a dotted rule id", async () => {
  const drafts = await execute(npmDeprecatedImporter, { replay: recording });
  const joi = drafts.rules.find((rule) => rule["x-npm"]?.package === "@hapi/joi")!;
  assert.equal(joi.id, "npm.package.hapi.joi.deprecated");
  assert.equal(joi.purl, "pkg:npm/%40hapi/joi");
  assert.equal(joi.sources[1]!.url, "https://registry.npmjs.org/@hapi%2fjoi");
  assert.equal(registryUrl("@hapi/joi"), "https://registry.npmjs.org/@hapi%2fjoi/latest");
});

test("every candidate is a valid, unique, sorted npm name whose rule id is unique", () => {
  assert.equal(new Set(NPM_CANDIDATES).size, NPM_CANDIDATES.length);
  assert.deepEqual([...NPM_CANDIDATES], [...NPM_CANDIDATES].sort());
  for (const name of NPM_CANDIDATES) assert.match(name, NPM_NAME, name);
  assert.equal(new Set(NPM_CANDIDATES.map(ruleSlug)).size, NPM_CANDIDATES.length);
});

test("builds rule ids from package names", () => {
  assert.equal(ruleSlug("request"), "request");
  assert.equal(ruleSlug("@hapi/joi"), "hapi.joi");
  assert.equal(ruleSlug("popper.js"), "popper.js");
  assert.equal(ruleSlug("JSONStream"), "jsonstream");
  assert.equal(ruleSlug("some_odd~name"), "some-odd-name");
});

test("rejects names npm does not allow", () => {
  for (const name of ["", "has space", "@scope", "@/name", "a/b", "UPPER space"]) assert.doesNotMatch(name, NPM_NAME, name);
});

test("a package whose latest version is not deprecated produces no rule and is listed in the notes", async () => {
  const names = Object.fromEntries(NPM_CANDIDATES.map((name) => [registryUrl(name), { name, version: "1.0.0" }]));
  const result = await runImporter(npmDeprecatedImporter, registry({ ...names, [registryUrl("request")]: { name: "request", version: "3.0.0", deprecated: "gone" }, [registryUrl("tslint")]: { name: "tslint", deprecated: "" } }));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["npm.package.request.deprecated"]);
  assert.equal(result.notes.length, 1);
  const note = result.notes[0]!;
  assert.match(note, /^Not deprecated at their latest version, so no rule .*: .+\.$/);
  for (const name of ["@hapi/joi", "babel-eslint", "uglify-es"]) assert.ok(note.includes(name), name);
  assert.ok(note.includes("tslint"), "an empty notice is not a deprecation");
});

test("a package that was removed from npm is noted, but any other failure stops the run", async () => {
  const everything = Object.fromEntries(NPM_CANDIDATES.map((name) => [registryUrl(name), { name, deprecated: "old" }]));
  const missing = { ...everything };
  delete (missing as Record<string, unknown>)[registryUrl("sntp")];
  const result = await runImporter(npmDeprecatedImporter, registry(missing));
  assert.ok(result.notes.includes("Skipped sntp: not found on npm."));
  assert.equal(result.rules.length, NPM_CANDIDATES.length - 1);

  const outage = { ...everything, [registryUrl("sntp")]: new ImporterError(`GET ${registryUrl("sntp")} failed: HTTP 503`) };
  await assert.rejects(runImporter(npmDeprecatedImporter, registry(outage)), /HTTP 503/);
});

test("quotes long notices briefly and flattens whitespace", async () => {
  const everything = Object.fromEntries(NPM_CANDIDATES.map((name) => [registryUrl(name), { name }]));
  const long = `${"Please\n  move   to the replacement. ".repeat(20)}`;
  const result = await runImporter(npmDeprecatedImporter, registry({ ...everything, [registryUrl("request")]: { name: "request", deprecated: long } }));
  const summary = result.rules[0]!.summary;
  assert.ok(summary.length <= 'npm marks request as deprecated: ""'.length + 280, `${summary.length}`);
  assert.ok(summary.endsWith('…"'));
  assert.doesNotMatch(summary, /\n|  /);
});

test("against the registry it updates the rules that exist and flags the one it would duplicate", async () => {
  const existing = JSON.parse(await readFile(resolve("registry/npm.json"), "utf8")) as RegistryV2;
  const drafts = await execute(npmDeprecatedImporter, { replay: recording });
  const diff = diffDrafts(drafts, existing);
  const existingIds = new Set(existing.rules.map((rule) => rule.id));
  const overlap = drafts.rules
    .map((rule) => rule.id)
    .filter((id) => existingIds.has(id))
    .sort();
  // Every drafted rule the registry already has is either updated (hand-written wording differs) or unchanged
  // (reviewed rules accepted straight from a draft).
  assert.deepEqual([...diff.changed.map((change) => change.id), ...diff.unchanged].sort(), overlap);
  for (const id of ["npm.package.babel-eslint.deprecated", "npm.package.tslint.deprecated", "npm.package.uglify-es.deprecated"]) {
    assert.ok(overlap.includes(id), `${id} is reviewed against its version-specific draft`);
  }
  assert.deepEqual(diff.duplicates, [], "version-specific drafts do not duplicate a wildcard lifecycle rule");
  assert.equal(diff.added.length, drafts.rules.length - overlap.length);
});

test("a response that is not JSON is reported with its URL", async () => {
  await assert.rejects(runImporter(npmDeprecatedImporter, { now: new Date("2026-10-15T12:00:00Z"), fetchText: async () => "<html>" }), /not valid JSON/);
});

test("a latest-version notice never marks older unflagged releases deprecated", async () => {
  const result = await runImporter(npmDeprecatedImporter, {
    now: new Date("2026-10-19T12:00:00Z"),
    async fetchText(url) {
      if (url === registryUrl("@types/glob")) return JSON.stringify({ name: "@types/glob", version: "9.0.0", deprecated: "stub" });
      if (url === registryUrl("@types/glob").replace(/\/latest$/, "")) return JSON.stringify({ versions: {
        "8.1.0": { version: "8.1.0" },
        "9.0.0": { version: "9.0.0", deprecated: "stub" },
      } });
      throw new ImporterError(`GET ${url} failed: HTTP 404`);
    },
  });
  assert.equal(result.rules[0]?.vers, "vers:npm/9.0.0");
});
