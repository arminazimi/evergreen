import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { DATA_SIGNER, DATA_BUNDLE_SCHEMA_VERSION } from "@velella/ebb/data-bundle";
import { STALE_AFTER_DAYS } from "@velella/ebb/data-status";
import { DEFAULT_RELEASES_URL } from "@velella/ebb/data-update";

import { commands } from "../src/commands/index.generated.js";
import { renderHelp } from "../src/completions.js";

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
  const help = renderHelp(commands);
  const implementation = `${help}\n${await read("src/commands/data.ts")}\n${await read("src/commands/runtime.ts")}\n${await read("src/cache-paths.ts")}\n${await read("node_modules/@velella/ebb/dist/src/cache-paths.js")}`;
  for (const text of ["data status", "data update", "--data-version"]) {
    assert.ok(docs.includes(text), `docs mention ${text}`);
    assert.ok(
      implementation.includes(text.replace("data ", "")) || implementation.includes(text),
      `the CLI implements ${text}`,
    );
  }
  for (const variable of [
    "EBB_DATA_DIR",
    "EVERGREEN_DATA_VERSION",
    "EBB_DATA_URL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ]) {
    assert.ok(docs.includes(variable), `docs mention ${variable}`);
  }
  for (const variable of ["EBB_DATA_DIR", "EVERGREEN_DATA_VERSION"]) {
    assert.ok(
      (await read("node_modules/@velella/ebb/dist/src/cache-paths.js")).includes(variable) ||
        implementation.includes(variable),
      `${variable} is read by the code`,
    );
  }
  assert.ok((await read("node_modules/@velella/ebb/dist/src/data-update.js")).includes("EBB_DATA_URL"));
  assert.match(docs, new RegExp(`more than ${STALE_AFTER_DAYS} days|after ${STALE_AFTER_DAYS} days`));
  assert.ok(DEFAULT_RELEASES_URL.includes("/releases"));
});

test("the privacy page names the one network command and links to the data page", async () => {
  const privacy = await read("docs/PRIVACY.md");
  assert.match(privacy, /Scans use no network\. The one exception is `evergreen data update`/);
  assert.ok(privacy.includes("(DATA.md)"));
});

test("the release checklist and the data page send data releases to Ebb", async () => {
  const releasing = await read("docs/RELEASING.md");
  assert.ok(releasing.includes("## Rule data"));
  assert.ok(docs.includes("RELEASING.md#rule-data"));
  for (const text of [releasing, docs]) {
    assert.ok(text.includes("https://github.com/velella-sh/ebb/blob/main/docs/DATA.md#publishing-a-bundle"));
  }
  assert.ok(DEFAULT_RELEASES_URL.startsWith("https://api.github.com/repos/velella-sh/ebb/"), DEFAULT_RELEASES_URL);
});

test("every file and page that docs/DATA.md links to exists", async () => {
  for (const link of new Set([...docs.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!))) {
    await access(resolve("docs", link));
  }
  for (const path of ["data/sigstore-trusted-root.json", "schemas/data-bundle.v1.schema.json"])
    assert.ok(docs.includes(path.replace("schemas/", "")) || docs.includes(path), path);
});
