import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendReleaseLog,
  extendsReleaseLog,
  RELEASE_LOG_GENESIS,
  ReleaseLogError,
  verifyReleaseLog,
} from "../src/data-release-log.js";

const digest = (char: string) => `sha256:${char.repeat(64)}`;
const release = (version: string, char: string) => ({
  version,
  contentDigest: digest(char),
  bundleSha256: digest(char === "a" ? "b" : "a"),
  createdAt: `${version.replaceAll(".", "-")}T00:00:00Z`,
});

function build(): string {
  let log = "";
  log = appendReleaseLog(log, release("2026.10.16", "a"));
  log = appendReleaseLog(log, release("2026.10.17", "c"));
  return appendReleaseLog(log, release("2026.10.18", "d"));
}

test("an empty log verifies, and the first entry starts at the genesis hash", () => {
  assert.deepEqual(verifyReleaseLog(""), []);
  assert.equal(verifyReleaseLog(appendReleaseLog("", release("2026.10.16", "a")))[0]!.previous, RELEASE_LOG_GENESIS);
});

test("a log built by appending verifies and links every entry to the one before", () => {
  const entries = verifyReleaseLog(build());
  assert.equal(entries.length, 3);
  assert.equal(entries[1]!.previous, entries[0]!.hash);
  assert.equal(entries[2]!.previous, entries[1]!.hash);
});

test("changing a past release is detected", () => {
  const lines = build().split("\n");
  lines[0] = lines[0]!.replace(digest("a"), digest("e"));
  assert.throws(() => verifyReleaseLog(lines.join("\n")), /Entry 1 \(2026\.10\.16\) was changed/);
});

test("rewriting a past entry and its hash still breaks the next link", () => {
  const original = build().split("\n");
  const forged = appendReleaseLog("", release("2026.10.16", "e")).split("\n")[0]!;
  assert.throws(() => verifyReleaseLog([forged, ...original.slice(1)].join("\n")), /Entry 2 does not follow entry 1/);
});

test("removing or reordering an entry is detected", () => {
  const lines = build().split("\n");
  assert.throws(() => verifyReleaseLog([lines[0], lines[2], ""].join("\n")), ReleaseLogError);
  assert.throws(() => verifyReleaseLog([lines[1], lines[0], lines[2], ""].join("\n")), ReleaseLogError);
});

test("a log that does not end with a newline, or is not canonical, is refused", () => {
  assert.throws(() => verifyReleaseLog(build().trimEnd()), /newline/);
  const first = build().split("\n")[0]!;
  assert.throws(
    () => verifyReleaseLog(`${JSON.stringify(JSON.parse(first), null, 1).replaceAll("\n", " ")}\n`),
    ReleaseLogError,
  );
});

test("a damaged log is never extended, and a version cannot repeat", () => {
  assert.throws(
    () => appendReleaseLog(build().replace(digest("c"), digest("e")), release("2026.10.19", "f")),
    ReleaseLogError,
  );
  assert.throws(() => appendReleaseLog(build(), release("2026.10.18", "f")), /already in the log/);
});

test("extendsReleaseLog accepts growth and rejects a rewritten past", () => {
  const full = build();
  const older = full.split("\n").slice(0, 2).join("\n") + "\n";
  assert.equal(extendsReleaseLog(older, full), true);
  assert.equal(extendsReleaseLog(full, older), false);
  const rewritten = appendReleaseLog(appendReleaseLog("", release("2026.10.16", "e")), release("2026.10.17", "c"));
  assert.equal(extendsReleaseLog(older, rewritten), false);
});
