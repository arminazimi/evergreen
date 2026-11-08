import assert from "node:assert/strict";
import { test } from "node:test";

import { recommendVersion, renderRecommendText } from "../src/recommend.js";
import { runCli } from "./cli-runner.js";

test("Node.js: the newest line that stays supported long enough is recommended", async () => {
  const result = await recommendVersion({ name: "node", asOf: "2026-01-01" });
  assert.equal(result.status, "recommended");
  assert.equal(result.recommended, "22");
  assert.equal(result.supportedUntil, "2027-04-30");
  assert.equal(result.product?.purl, "pkg:generic/nodejs");
  assert.deepEqual(result.alternatives, []);
  assert.ok(result.sources.length > 0 && result.sources.every((source) => source.url.startsWith("https://")));
  const ended = result.avoid.find((entry) => entry.line === "18");
  assert.deepEqual({ reason: ended?.reason, endDate: ended?.endDate }, { reason: "ended", endDate: "2025-04-30" });
  const sooner = result.avoid.find((entry) => entry.line === "20");
  assert.deepEqual(
    { reason: sooner?.reason, endDate: sooner?.endDate },
    { reason: "ends-sooner", endDate: "2026-04-30" },
  );
  assert.ok(!result.avoid.some((entry) => entry.line === "22"));
  assert.doesNotMatch(JSON.stringify(result), /latest/i);
});

test("minimumSupportDays decides the boundary: exactly the minimum qualifies, one day less does not", async () => {
  // Node.js 22 ends 2027-04-30, which is exactly 180 days after 2026-11-01.
  const on = await recommendVersion({
    name: "nodejs",
    asOf: "2026-11-01",
    minimumSupportDays: 180,
  });
  assert.equal(on.recommended, "22");
  const after = await recommendVersion({
    name: "nodejs",
    asOf: "2026-11-02",
    minimumSupportDays: 180,
  });
  assert.equal(after.status, "no-qualifying-line");
  assert.equal(after.recommended, undefined);
  assert.equal(after.avoid.find((entry) => entry.line === "22")?.reason, "ends-sooner");
  const relaxed = await recommendVersion({
    name: "nodejs",
    asOf: "2026-11-02",
    minimumSupportDays: 90,
  });
  assert.equal(relaxed.recommended, "22");
  assert.equal(relaxed.query.minimumSupportDays, 90);
});

test("the answer is deterministic for a fixed date and defaults to 180 days", async () => {
  const first = await recommendVersion({ name: "node", asOf: "2026-01-01" });
  const second = await recommendVersion({
    name: "node",
    asOf: "2026-01-01",
    minimumSupportDays: 180,
  });
  assert.deepEqual(first, second);
  assert.equal(first.query.minimumSupportDays, 180);
});

test("Python: ranges that are not one release line are listed to avoid, never recommended", async () => {
  const result = await recommendVersion({ name: "python", asOf: "2026-11-08" });
  assert.equal(result.status, "no-qualifying-line");
  assert.equal(result.recommended, undefined);
  const older = result.avoid.find((entry) => entry.line === "<3.10");
  assert.deepEqual({ reason: older?.reason, endDate: older?.endDate }, { reason: "ended", endDate: "2025-10-31" });
  assert.match(result.message, /not a statement that any version is safe/);
});

test("a GitHub Action by package URL lists the ended majors to avoid", async () => {
  const result = await recommendVersion({
    name: "pkg:githubactions/actions/checkout",
    asOf: "2026-11-08",
  });
  assert.equal(result.product?.purl, "pkg:github/actions/checkout");
  assert.equal(result.status, "no-qualifying-line");
  const ended = result.avoid.find((entry) => entry.line === "<5.0.0");
  assert.deepEqual({ reason: ended?.reason, endDate: ended?.endDate }, { reason: "ended", endDate: "2026-09-23" });
  const sameProduct = await recommendVersion({
    name: "pkg:github/actions/checkout",
    asOf: "2026-11-08",
  });
  assert.deepEqual({ ...sameProduct, query: result.query }, result);
});

test("a container image package URL selects the image, not the runtime of the same name", async () => {
  const result = await recommendVersion({
    name: "pkg:docker/library/node",
    asOf: "2026-01-01",
  });
  assert.equal(result.product?.purl, "pkg:docker/library/node");
  assert.equal(result.recommended, "22");
  assert.equal(result.supportedUntil, "2027-04-30");
});

test("a product with no data says so and is not a statement that any version is safe", async () => {
  for (const name of ["no-such-product-anywhere", "pkg:npm/no-such-package-anywhere"]) {
    const result = await recommendVersion({ name, asOf: "2026-01-01" });
    assert.equal(result.status, "no-data");
    assert.equal(result.recommended, undefined);
    assert.deepEqual([result.alternatives, result.avoid, result.sources], [[], [], []]);
    assert.match(result.message, /not a statement that any version is safe/);
  }
});

test("invalid dates and minimums are rejected", async () => {
  await assert.rejects(recommendVersion({ name: "node", asOf: "yesterday" }), /Invalid asOf date/);
  await assert.rejects(recommendVersion({ name: "node", asOf: "2026-02-30" }), /Invalid asOf date/);
  await assert.rejects(recommendVersion({ name: "node", minimumSupportDays: -1 }), /non-negative integer/);
  await assert.rejects(recommendVersion({ name: "node", minimumSupportDays: 1.5 }), /non-negative integer/);
});

test("text output leads with the answer and names its evidence", async () => {
  const text = renderRecommendText(await recommendVersion({ name: "node", asOf: "2026-01-01" }));
  assert.match(text, /^nodejs: 22 \(supported until 2027-04-30\)/);
  assert.match(text, /Avoid: 18 \(ended 2025-04-30\)/);
  assert.match(text, /https:\/\//);
  assert.match(text, /As of 2026-01-01, at least 180 days of support\./);
});

test("the CLI prints text and JSON, honours --as-of and --min-days, and rejects bad usage", async () => {
  const text = await runCli(["recommend", "node", "--as-of", "2026-01-01"]);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /^nodejs: 22/);
  const json = await runCli(["recommend", "node", "--as-of", "2026-11-02", "--min-days", "90", "--json"]);
  assert.equal(json.code, 0);
  const parsed = JSON.parse(json.stdout) as {
    schemaVersion: string;
    recommended: string;
  };
  assert.equal(parsed.schemaVersion, "evergreen.recommend.v1");
  assert.equal(parsed.recommended, "22");
  assert.equal((await runCli(["recommend"])).code, 2);
  assert.equal((await runCli(["recommend", "node", "--min-days", "soon"])).code, 2);
  assert.equal((await runCli(["recommend", "node", "--as-of"])).code, 2);
  assert.equal((await runCli(["recommend", "node", "--as-of", "nope"])).code, 2);
});
