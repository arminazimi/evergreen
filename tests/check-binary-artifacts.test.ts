import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";

import {
  checkBinaryArtifacts,
  hasNulByte,
  MALFORMED_INPUT_FIXTURES,
  renderCheck,
  SCANNED_DIRECTORIES,
  SNIFF_BYTES,
  trackedFiles,
} from "../tools/check-binary-artifacts.js";

const TOOL = resolve("dist/tools/check-binary-artifacts.js");

function git(root: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function repository(context: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-check-binaries-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  return root;
}

async function write(root: string, path: string, contents: string | Uint8Array): Promise<void> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

function runTool(root: string) {
  return spawnSync(process.execPath, [TOOL], { cwd: root, encoding: "utf8" });
}

/** The committed exemption list is repository-specific, so a fixture repository has to carry it. */
async function writeExemptFixtures(root: string): Promise<void> {
  for (const path of MALFORMED_INPUT_FIXTURES) await write(root, path, Buffer.from("value: a\x00b\n"));
}

test("a NUL byte in the sniffed prefix means binary, one after it does not", () => {
  assert.equal(hasNulByte(Buffer.from("plain text\n")), false);
  assert.equal(hasNulByte(Buffer.from([0x61, 0x00, 0x62])), true);
  const late = Buffer.alloc(SNIFF_BYTES + 4, 0x61);
  late[SNIFF_BYTES + 1] = 0;
  assert.equal(hasNulByte(late), false);
  assert.equal(hasNulByte(late.subarray(0, SNIFF_BYTES + 2), SNIFF_BYTES + 2), true);
});

test("only tracked files under src and tests are scanned", async (context) => {
  const root = await repository(context);
  await write(root, "src/main.ts", "export const answer = 42;\n");
  await write(root, "tests/fixtures/readme.txt", "text\n");
  await write(root, "src/vendor/blob.wasm", Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  await write(root, "tests/untracked.bin", Buffer.from([0x01, 0x00]));
  await write(root, "docs/outside.bin", Buffer.from([0x01, 0x00]));
  git(root, "add", "src", "tests/fixtures", "docs");

  assert.deepEqual(trackedFiles(root), ["src/main.ts", "src/vendor/blob.wasm", "tests/fixtures/readme.txt"]);
  assert.deepEqual(SCANNED_DIRECTORIES, ["src", "tests"]);

  const check = await checkBinaryArtifacts(root, { exempt: [] });
  assert.equal(check.scanned, 3);
  assert.deepEqual(
    check.findings.map((finding) => finding.path),
    ["src/vendor/blob.wasm"],
  );
});

test("a malformed-input exemption keeps its fixture and no other binary", async (context) => {
  const root = await repository(context);
  const fixture = "tests/fixtures/malformed/nul-byte.yaml";
  await write(root, fixture, Buffer.from("key: va\x00lue\n"));
  await write(root, "src/vendor/blob.wasm", Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  git(root, "add", "-A");

  const check = await checkBinaryArtifacts(root, { exempt: [fixture] });
  assert.deepEqual(
    check.findings.map((finding) => finding.path),
    ["src/vendor/blob.wasm"],
  );
});

test("an exemption fails once it is untracked or no longer binary", async (context) => {
  const root = await repository(context);
  await write(root, "tests/fixtures/now-text.yaml", "key: value\n");
  git(root, "add", "-A");

  const check = await checkBinaryArtifacts(root, {
    exempt: ["tests/fixtures/missing.yaml", "tests/fixtures/now-text.yaml"],
  });
  assert.deepEqual(check.findings, [
    { path: "tests/fixtures/missing.yaml", message: "exemption is stale: the file is no longer tracked" },
    { path: "tests/fixtures/now-text.yaml", message: "exemption is stale: the file no longer contains a NUL byte" },
  ]);
});

test("the committed malformed-input fixtures still need their exemption", async () => {
  assert.deepEqual([...MALFORMED_INPUT_FIXTURES].sort(), [
    "tests/fixtures/java/malformed/gradle/gradle/wrapper/gradle-wrapper.properties",
    "tests/fixtures/java/malformed/pins/.java-version",
    "tests/fixtures/kubernetes/malformed/manifests/nul-byte.yaml",
  ]);
  const check = await checkBinaryArtifacts();
  assert.deepEqual(check.findings, []);
});

test("the check reports a clean repository and fails on a binary one", async (context) => {
  const clean = await repository(context);
  await write(clean, "src/main.ts", "export const answer = 42;\n");
  await writeExemptFixtures(clean);
  git(clean, "add", "-A");
  const passing = runTool(clean);
  assert.equal(passing.status, 0, passing.stderr);
  assert.match(passing.stdout, /Scanned 4 tracked files under src and tests\./);
  assert.match(passing.stdout, /No binary artifacts/);

  const dirty = await repository(context);
  await write(dirty, "src/action.bin", Buffer.from([0x00]));
  await writeExemptFixtures(dirty);
  git(dirty, "add", "-A");
  const failing = runTool(dirty);
  assert.equal(failing.status, 1, failing.stderr);
  assert.match(failing.stdout, /::error::src\/action\.bin: binary artifact in the repository/);
  assert.match(failing.stdout, /1 binary-artifact finding\(s\)/);
});

test("renderCheck names the exemptions that stay", () => {
  const rendered = renderCheck({ scanned: 12, findings: [] });
  assert.match(rendered, /12 tracked files/);
  assert.match(rendered, /3 malformed-input fixtures stay exempt/);
});
