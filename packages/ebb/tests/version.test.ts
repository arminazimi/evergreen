import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { VERSION } from "../src/version.js";

test("VERSION is the version in package.json", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  assert.equal(VERSION, manifest.version);
});
