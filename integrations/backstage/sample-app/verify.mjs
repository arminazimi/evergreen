#!/usr/bin/env node
/**
 * Asserts the sample app can load the portal export, match every sample Component,
 * and render cards. Run from the repository root:
 *
 *   node integrations/backstage/sample-app/verify.mjs
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { loadPortalCatalog } from "../common/load-portal.mjs";
import {
  findService,
  parsePortalCatalog,
  totalFindings,
} from "../common/portal.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const repoRoot = resolve(here, "../../..");
const portalPath = resolve(root, "sample-data/portal-export.json");
const schemaPath = resolve(repoRoot, "schemas/portal.v1.schema.json");

const catalog = await loadPortalCatalog(portalPath);
assert.equal(catalog.schemaVersion, "evergreen.portal.v1");
assert.equal(catalog.services.length, 9);

const api = findService(catalog, "/repos/api");
assert.ok(api);
assert.equal(api.nextEndOfLife, "2026-12-31");
assert.equal(totalFindings(api), 5);
assert.equal(findService(catalog, "/repos/api/")?.path, "/repos/api");
assert.equal(findService(catalog, "api")?.path, "/repos/api");
assert.equal(findService(catalog, "/repos/does-not-exist"), undefined);

const checkout = findService(catalog, "/repos/checkout");
assert.ok(checkout);
assert.equal(totalFindings(checkout), 0);
assert.equal(checkout.nextEndOfLife, undefined);

// Sample must stay aligned with the schema checked into this repository.
const require = createRequire(resolve(repoRoot, "package.json"));
const { Ajv2020 } = require("ajv/dist/2020.js");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const validate = ajv.compile(schema);
assert.equal(validate(catalog), true, JSON.stringify(validate.errors));

const entitiesText = await readFile(resolve(here, "catalog/entities.yaml"), "utf8");
const paths = [...entitiesText.matchAll(/evergreen\.io\/service-path:\s*(\S+)/g)].map((m) => m[1]);
assert.equal(paths.length, 4);
for (const path of paths) {
  assert.ok(findService(catalog, path), `sample entity path ${path} must exist in the portal export`);
}

assert.throws(
  () => parsePortalCatalog({ schemaVersion: "nope", services: [] }),
  /unsupported portal schemaVersion/,
);

await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, [resolve(here, "serve.mjs"), "--write-only"], {
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolvePromise(undefined);
    else reject(new Error(`serve.mjs --write-only exited ${code}`));
  });
});

const preview = await readFile(resolve(here, "out/preview.html"), "utf8");
assert.match(preview, /data-component="api"/);
assert.match(preview, /data-component="legacy-batch"/);
assert.match(preview, /data-component="checkout"/);
assert.match(preview, /data-component="payments"/);
assert.match(preview, /2026-12-31/);
assert.match(preview, /evergreen-report-api\.json/);
assert.match(preview, /Evergreen lifecycle risk|Lifecycle risk per component/);

console.log("integrations/backstage sample verification passed");
