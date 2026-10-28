import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import {
  API_DIRECTORY,
  PRODUCTS_DIRECTORY,
  RECENT_LIMIT,
  buildDocuments,
  buildFiles,
  drift,
  loadRegistries,
  productId,
  renderDocument,
  validateDocuments,
} from "../tools/build-data-api.js";
import type { ApiDocumentFile, ApiIndex, ApiProduct, ApiRecent } from "../tools/build-data-api.js";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const rule = (id: string, overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule => ({
  id,
  ecosystem: "npm",
  purl: "pkg:npm/demo",
  vers: "vers:npm/*",
  event: "deprecated",
  title: `Title ${id}`,
  summary: "A lifecycle summary.",
  severity: "high",
  sources: [{ title: "Source", url: "https://example.com/source" }],
  provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "tester" },
  ...overrides,
});

const registry = (ecosystem: string, rules: RegistryV2Rule[]): RegistryV2 => ({
  schemaVersion: "evergreen.registry.v2",
  ecosystem,
  rules,
});

function documentAt(documents: readonly ApiDocumentFile[], path: string): ApiDocumentFile {
  const file = documents.find((entry) => entry.path === path);
  assert.ok(file, `no document at ${path}`);
  return file;
}

async function apiValidator() {
  const apiSchema = JSON.parse(await readFile(resolve("schemas/api-product.v1.schema.json"), "utf8")) as object;
  const registrySchema = JSON.parse(await readFile(resolve("schemas/registry.v2.schema.json"), "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(registrySchema);
  return ajv.compile(apiSchema);
}

test("emits an index, one document per product PURL, and a recent-changes file", () => {
  const documents = buildDocuments([
    registry("npm", [
      rule("npm.b.old", {
        purl: "pkg:npm/b",
        provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "tester" },
      }),
      rule("npm.b.new", {
        purl: "pkg:npm/b",
        provenance: { observedAt: "2026-10-08", reviewedAt: "2026-10-09", reviewer: "tester" },
      }),
      rule("npm.a.one", { purl: "pkg:npm/a", deadline: "2027-01-01" }),
    ]),
    registry("osv", [rule("osv.b", { ecosystem: "osv", purl: "pkg:npm/b" })]),
  ]);

  assert.deepEqual(documents.map((file) => file.path), [
    `${API_DIRECTORY}/index.json`,
    `${API_DIRECTORY}/products/npm-a.json`,
    `${API_DIRECTORY}/products/npm-b.json`,
    `${API_DIRECTORY}/recent.json`,
  ]);

  const index = documentAt(documents, `${API_DIRECTORY}/index.json`).document as ApiIndex;
  assert.equal(index.schemaVersion, "evergreen.api-index.v1");
  assert.equal(index.recent, "recent.json");
  assert.equal(index.rules, 4);
  assert.equal(index.latestReview, "2026-10-09");
  assert.deepEqual(index.products.map((entry) => entry.id), ["npm-a", "npm-b"]);
  assert.deepEqual(index.products.map((entry) => entry.path), ["products/npm-a.json", "products/npm-b.json"]);

  const product = documentAt(documents, `${PRODUCTS_DIRECTORY}/npm-b.json`).document as ApiProduct;
  assert.equal(product.schemaVersion, "evergreen.api-product.v1");
  assert.equal(product.purl, "pkg:npm/b");
  assert.deepEqual(product.ecosystems, ["npm", "osv"], "rules from several ecosystems share one product");
  assert.deepEqual(product.rules.map((entry) => entry.id), ["npm.b.new", "npm.b.old", "osv.b"]);
  assert.equal(product.latestReview, "2026-10-09");

  const recent = documentAt(documents, `${API_DIRECTORY}/recent.json`).document as ApiRecent;
  assert.equal(recent.schemaVersion, "evergreen.api-recent.v1");
  assert.deepEqual(recent.changes.map((entry) => entry.ruleId), ["npm.b.new", "npm.a.one", "npm.b.old", "osv.b"]);
  assert.deepEqual(recent.changes[1]?.deadline, "2027-01-01");
});

test("a product summarizes its earliest deadline and every lifecycle event", () => {
  const documents = buildDocuments([
    registry("npm", [
      rule("npm.demo.late", { deadline: "2028-01-01" }),
      rule("npm.demo.soon", { event: "end-of-life", deadline: "2026-12-01" }),
    ]),
  ]);
  const product = documentAt(documents, `${PRODUCTS_DIRECTORY}/npm-demo.json`).document as ApiProduct;
  assert.equal(product.earliestDeadline, "2026-12-01");
  assert.deepEqual(product.events, ["deprecated", "end-of-life"], "events follow lifecycle order");
});

test("product ids are readable slugs derived from the decoded PURL", () => {
  assert.equal(productId("pkg:npm/%40angular/core"), "npm-angular-core");
  assert.equal(productId("pkg:docker/library/node"), "docker-library-node");
  assert.equal(productId("pkg:generic/kubernetes/apps/Deployment"), "generic-kubernetes-apps-deployment");
  assert.throws(
    () =>
      buildDocuments([
        registry("npm", [
          rule("npm.a.hyphen", { purl: "pkg:npm/a-b" }),
          rule("npm.a.slash", { purl: "pkg:npm/a/b" }),
        ]),
      ]),
    /both map to id "npm-a-b"/,
  );
});

test("the recent file keeps the newest rules by review date, capped at the limit", () => {
  const rules = Array.from({ length: RECENT_LIMIT + 5 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
    return rule(`npm.demo.${String(index).padStart(3, "0")}`, {
      provenance: { observedAt: date, reviewedAt: date, reviewer: "tester" },
    });
  });
  const recent = documentAt(
    buildDocuments([registry("npm", rules)]),
    `${API_DIRECTORY}/recent.json`,
  ).document as ApiRecent;
  assert.equal(recent.changes.length, RECENT_LIMIT);
  assert.equal(recent.changes[0]?.ruleId, "npm.demo.104");
  assert.equal(recent.changes.at(-1)?.ruleId, "npm.demo.005");
});

test("the same registry always renders the same bytes, independent of input order and key order", async () => {
  const registries = await loadRegistries(resolve("registry"));
  const first = buildFiles(registries);
  const second = buildFiles(registries);
  assert.deepEqual(second, first);
  assert.deepEqual(buildFiles([...registries].reverse()), first);

  for (const file of first) {
    assert.ok(file.contents.endsWith("}\n"), `${file.path} ends with one newline`);
    assert.equal(file.contents.includes("\r"), false, `${file.path} has no carriage returns`);
  }

  assert.equal(
    renderDocument({ b: 1, a: { d: 2, c: "text" } }),
    '{\n  "a": {\n    "c": "text",\n    "d": 2\n  },\n  "b": 1\n}\n',
  );
});

test("every generated document matches schemas/api-product.v1.schema.json", async () => {
  const documents = buildDocuments(await loadRegistries(resolve("registry")));
  await validateDocuments(documents, resolve("."));

  const validate = await apiValidator();
  for (const file of documents) {
    assert.equal(validate(file.document), true, `${file.path}: ${JSON.stringify(validate.errors)}`);
  }

  const malformed = structuredClone(documentAt(documents, `${API_DIRECTORY}/index.json`).document) as ApiIndex;
  malformed.products[0]!.events = ["sunset" as never];
  await assert.rejects(
    validateDocuments([{ path: `${API_DIRECTORY}/index.json`, document: malformed }], resolve(".")),
    /does not match schemas\/api-product\.v1\.schema\.json/,
  );
});

test("the committed API files match the registry and cover every product", async () => {
  const registries = await loadRegistries(resolve("registry"));
  const files = buildFiles(registries);
  assert.deepEqual(await drift(files, resolve(".")), []);

  const index = JSON.parse(await readFile(resolve(API_DIRECTORY, "index.json"), "utf8")) as ApiIndex;
  const products = files.filter((file) => file.path.startsWith(`${PRODUCTS_DIRECTORY}/`));
  assert.equal(files.length, products.length + 2);
  assert.equal(products.length, index.products.length);
  assert.equal(index.rules, registries.reduce((total, item) => total + item.rules.length, 0));
  for (const entry of index.products) {
    assert.ok(files.some((file) => file.path === `${API_DIRECTORY}/${entry.path}`), `missing ${entry.path}`);
  }
});

test("the CLI rebuilds identically, removes stale files, and --check reports drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-data-api-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "registry"), { recursive: true });
  await cp(resolve("schemas"), join(root, "schemas"), { recursive: true });
  const demo = registry("demo", [
    rule("demo.one", { ecosystem: "demo", purl: "pkg:generic/demo", vers: "vers:semver/<2.0.0" }),
  ]);
  await writeFile(join(root, "registry", "demo.json"), `${JSON.stringify(demo, null, 2)}\n`);

  const cli = resolve("dist/tools/build-data-api.js");
  const run = (...args: string[]) => execute(process.execPath, [cli, "--root", root, ...args]);
  await run();
  const index = await readFile(join(root, API_DIRECTORY, "index.json"), "utf8");
  await run();
  assert.equal(await readFile(join(root, API_DIRECTORY, "index.json"), "utf8"), index);
  await run("--check");

  const stale = join(root, PRODUCTS_DIRECTORY, "stale.json");
  await writeFile(stale, "{}\n");
  await assert.rejects(run("--check"), (error: { code: number; stderr: string }) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /stale: docs\/api\/v1\/products\/stale\.json/);
    return true;
  });
  await run();
  await assert.rejects(readFile(stale), /ENOENT/);
});
