import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseVcpkgManifest,
} from "../src/detectors/cpp/parse-vcpkg.js";

const fixtures = resolve("tests/fixtures/cpp");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses vcpkg.json direct dependencies and builtin-baseline with exact lines", async () => {
  assert.deepEqual(parseVcpkgManifest(await fixture("positive/vcpkg.json")), [
    { kind: "vcpkg-baseline", value: "664933b8d385dfc01f4e0cdff4c7c74e71f6a740", line: 5 },
    { kind: "vcpkg-dependency", name: "fmt", value: "fmt", line: 7 },
    { kind: "vcpkg-dependency", name: "zlib", value: "1.2.13", line: 10 },
    { kind: "vcpkg-dependency", name: "openssl", value: "openssl", line: 13 },
  ]);
  assert.deepEqual(parseVcpkgManifest(await fixture("zero/vcpkg.json")), [
    { kind: "vcpkg-baseline", value: "664933b8d385dfc01f4e0cdff4c7c74e71f6a740", line: 5 },
    { kind: "vcpkg-dependency", name: "fmt", value: "fmt", line: 7 },
    { kind: "vcpkg-dependency", name: "zlib", value: "1.3.1", line: 10 },
  ]);
});

test("vcpkg.json ignores lookalikes", async () => {
  assert.deepEqual(parseVcpkgManifest(await fixture("negative/vcpkg.json")), []);
});

test("malformed vcpkg.json returns nothing", async () => {
  assert.deepEqual(parseVcpkgManifest(await fixture("malformed/vcpkg.json")), []);
});
