import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { MAXIMUM_JSON_DEPTH, MAXIMUM_READ_BYTES, parseBoundedJson, readBoundedFile } from "../src/package-files.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-input-limits-"));
  temporaryRoots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const absolutePath = join(root, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
  return root;
}

test("a file larger than the read limit is skipped before it is read", async () => {
  const root = await repository({});
  const path = join(root, "package-lock.json");
  // Truncating an open handle extends the file without writing any blocks, so the fixture is instant.
  const handle = await open(path, "w");
  await handle.truncate(3 * 1024 ** 3);
  await handle.close();

  const read = await readBoundedFile(path);

  // Node itself refuses readFile above 2 GiB with ERR_FS_FILE_TOO_LARGE before reading a byte, so an
  // implementation that read before stat'ing would throw here instead of returning a skip: this
  // assertion passing is the proof that the whole 3 GiB file was never read.
  assert.equal(read?.skipped?.reason, "file-too-large");
  assert.match(read?.skipped?.detail ?? "", /above the 1048576-byte limit/);
  assert.equal(read?.contents, undefined);
});

test("a file at the byte limit is read and one byte more is skipped", async () => {
  const atLimitRoot = await repository({ "at-limit.json": "x".repeat(MAXIMUM_READ_BYTES) });
  const read = await readBoundedFile(join(atLimitRoot, "at-limit.json"));
  assert.equal(read?.contents?.length, MAXIMUM_READ_BYTES);
  assert.equal(read?.skipped, undefined);

  const overLimitRoot = await repository({ "over-limit.json": "x".repeat(MAXIMUM_READ_BYTES + 1) });
  const skipped = await readBoundedFile(join(overLimitRoot, "over-limit.json"));
  assert.equal(skipped?.skipped?.reason, "file-too-large");
  assert.equal(skipped?.contents, undefined);

  assert.equal(await readBoundedFile(join(atLimitRoot, "missing.json")), undefined);
});

test("JSON nested far past the depth limit is skipped, not parsed or crashed on", () => {
  const contents = "[".repeat(10_000) + "]".repeat(10_000);

  const parsed = parseBoundedJson(contents);

  assert.equal(parsed?.skipped?.reason, "nesting-too-deep");
  assert.match(parsed?.skipped?.detail ?? "", /above the 64-level limit/);
  assert.equal(parsed?.value, undefined);
});

test("JSON at exactly the depth limit parses", () => {
  let atLimit = '"x"';
  for (let i = 0; i < MAXIMUM_JSON_DEPTH; i += 1) atLimit = `[${atLimit}]`;
  const parsed = parseBoundedJson(atLimit);
  assert.equal(Array.isArray(parsed?.value), true);
  assert.equal(parsed?.skipped, undefined);

  let overLimit = '"x"';
  for (let i = 0; i < MAXIMUM_JSON_DEPTH + 1; i += 1) overLimit = `[${overLimit}]`;
  const skipped = parseBoundedJson(overLimit);
  assert.equal(skipped?.skipped?.reason, "nesting-too-deep");
  assert.equal(skipped?.value, undefined);
});

test("brackets inside strings do not count as nesting", () => {
  const brackets = "[".repeat(100) + "]".repeat(100);
  const parsed = parseBoundedJson(`{"a": "${brackets}"}`);
  assert.deepEqual(parsed?.value, { a: brackets });
  assert.equal(parsed?.skipped, undefined);

  const escaped = parseBoundedJson('{"a": "quote \\" [ still a string"}');
  assert.deepEqual(escaped?.value, { a: 'quote " [ still a string' });
  assert.equal(escaped?.skipped, undefined);

  const braces = parseBoundedJson(`{"a": "${"{".repeat(100)}"}`);
  assert.deepEqual(braces?.value, { a: "{".repeat(100) });
  assert.equal(braces?.skipped, undefined);
});

test("a small manifest reads and parses unchanged", async () => {
  const contents = JSON.stringify({ engines: { node: "^20.0.0" } }, null, 2);
  const root = await repository({ "package.json": contents });

  const read = await readBoundedFile(join(root, "package.json"));
  assert.equal(read?.contents, contents);
  assert.equal(read?.skipped, undefined);

  const parsed = parseBoundedJson(read?.contents ?? "");
  assert.deepEqual(parsed?.value, { engines: { node: "^20.0.0" } });
  assert.equal(parsed?.skipped, undefined);

  assert.equal(parseBoundedJson("{"), undefined);
});
