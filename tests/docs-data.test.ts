import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { DATA_SIGNER, DATA_BUNDLE_SCHEMA_VERSION } from "../src/data-bundle.js";
import { STALE_AFTER_DAYS } from "../src/data-status.js";
import { DEFAULT_RELEASES_URL } from "../src/data-update.js";

const read = (path: string) => readFile(resolve(path), "utf8");
const docs = await read("docs/DATA.md");

test("docs/DATA.md quotes the signer policy the verifier enforces", () => {
  assert.ok(docs.includes(DATA_SIGNER.issuer));
  const pattern = DATA_SIGNER.identityPattern;
  assert.ok(docs.includes(pattern), "the identity pattern appears verbatim");
  assert.equal(docs.split(pattern).length - 1, 2, "it is shown in the trust model and in the cosign command");
  assert.ok(docs.includes(DATA_BUNDLE_SCHEMA_VERSION));
});

test("docs/DATA.md documents the real commands, options, variables, and thresholds", async () => {
  const cli = await read("src/cli.ts");
  for (const text of ["data status", "data update", "--data-version"]) {
    assert.ok(docs.includes(text), `docs mention ${text}`);
    assert.ok(cli.includes(text.replace("data ", "")) || cli.includes(text), `the CLI implements ${text}`);
  }
  for (const variable of ["EVERGREEN_DATA_DIR", "EVERGREEN_DATA_VERSION", "EVERGREEN_DATA_URL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]) {
    assert.ok(docs.includes(variable), `docs mention ${variable}`);
  }
  for (const variable of ["EVERGREEN_DATA_DIR", "EVERGREEN_DATA_VERSION"]) {
    assert.ok((await read("src/data-source.ts")).includes(variable) || cli.includes(variable), `${variable} is read by the code`);
  }
  assert.ok((await read("src/data-update.ts")).includes("EVERGREEN_DATA_URL"));
  assert.match(docs, new RegExp(`more than ${STALE_AFTER_DAYS} days|after ${STALE_AFTER_DAYS} days`));
  assert.ok(DEFAULT_RELEASES_URL.includes("/releases"));
});

test("the privacy page names the one network command and links to the data page", async () => {
  const privacy = await read("docs/PRIVACY.md");
  assert.match(privacy, /Scans use no network\. The one exception is `evergreen data update`/);
  assert.ok(privacy.includes("(DATA.md)"));
});

test("the release checklist describes the data release the workflow performs", async () => {
  const releasing = await read("docs/RELEASING.md");
  const workflow = await read(".github/workflows/data-release.yml");
  assert.ok(releasing.includes("## Publishing lifecycle data"));
  assert.ok(docs.includes("RELEASING.md#publishing-lifecycle-data"));
  assert.match(releasing, /data-v2026\.10\.16/);
  assert.match(workflow, /tags: \["data-v\*"\]/);
  assert.match(workflow, /dry_run/);
  for (const asset of ["evergreen-data-", ".sigstore.json", "SHA256SUMS"]) assert.ok(workflow.includes(asset) && releasing.includes(asset.replace("evergreen-data-", "evergreen-data-")), asset);
});

test("every file and page that docs/DATA.md links to exists", async () => {
  for (const link of new Set([...docs.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!))) {
    await access(resolve("docs", link));
  }
  for (const path of ["data/sigstore-trusted-root.json", "schemas/data-bundle.v1.schema.json"]) assert.ok(docs.includes(path.replace("schemas/", "")) || docs.includes(path), path);
});
