import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { exampleImporter } from "../../tools/importers/example.js";
import { readRecording, recordingContext, replayContext, validateRecording } from "../../tools/importers/recording.js";
import type { Recording } from "../../tools/importers/recording.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { Importer, ImporterContext } from "../../tools/importers/types.js";

const exampleRecording = resolve("tests/importers/recordings/example-feed.json");

test("the example importer runs offline from its recording", async () => {
  const drafts = await execute(exampleImporter, { replay: exampleRecording });
  assert.deepEqual(drafts.rules.map((rule) => rule.id), ["npm.package.acme-widget.deprecated", "npm.package.zeta.eol"]);
  assert.deepEqual(drafts.notes, ['Skipped mystery: unknown status "sunsetting".']);
  // Without --now, a replay runs on the day it was recorded, so the result never changes.
  assert.equal(drafts.observedAt, "2026-10-15");
  assert.equal(drafts.rules[0]!.provenance.observedAt, "2026-10-15");
  assert.equal(JSON.stringify(drafts), JSON.stringify(await execute(exampleImporter, { replay: exampleRecording })));
  assert.equal((await execute(exampleImporter, { replay: exampleRecording, now: "2027-01-02" })).observedAt, "2027-01-02");
});

test("a recording captured from a real server replays to identical drafts", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/feed.json") return void response.writeHead(200).end(JSON.stringify({ products: [{ name: "left", status: "eol", title: "left is end-of-life", summary: "Gone.", url: "https://example.com/left" }] }));
    response.writeHead(404).end("no");
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const directory = await mkdtemp(join(tmpdir(), "evergreen-recording-"));
  t.after(async () => { server.closeAllConnections(); server.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const importer: Importer = {
    ...exampleImporter,
    import: async (context) => {
      const rules = JSON.parse(await context.fetchText(`${base}/feed.json`)) as { products: { name: string }[] };
      const absent = await context.fetchText(`${base}/absent`).then(() => "present", (error: Error) => error.message);
      return exampleImporter.import({ ...context, fetchText: async () => JSON.stringify(rules) }).then((out) => ({ ...out, notes: [...out.notes, `absent: ${absent.replace(base, "<base>")}`] }));
    },
  };

  const file = join(directory, "example-feed.json");
  const live = await execute(importer, { record: file, now: "2026-10-15" });
  const recording = await readRecording(file);
  assert.deepEqual(recording.responses.map((response) => [response.url.replace(base, "<base>"), response.body === undefined ? "error" : "body"]), [["<base>/feed.json", "body"], ["<base>/absent", "error"]]);
  assert.match(recording.responses[1]!.error!, /failed: HTTP 404/);
  assert.equal(recording.recordedAt, "2026-10-15");

  server.closeAllConnections();
  server.close(); // from here on the network is unavailable
  assert.equal(JSON.stringify(await execute(importer, { replay: file })), JSON.stringify(live));
});

test("a failed run still saves what it read", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-recording-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const failing: Importer = { ...exampleImporter, import: async (context) => { await context.fetchText("http://127.0.0.1:1/never"); return { rules: [], notes: [] }; } };
  const file = join(directory, "partial.json");
  await assert.rejects(execute(failing, { record: file }), /failed/);
  assert.equal((await readRecording(file)).responses[0]!.url, "http://127.0.0.1:1/never");
});

test("replay answers only from the recording and explains what is missing", async () => {
  const recording: Recording = { schemaVersion: "evergreen.importer-recording.v1", importer: "x", recordedAt: "2026-10-15", responses: [
    { url: "https://example.com/a", body: "A" },
    { url: "https://example.com/a", accept: "application/json", body: "A-json" },
    { url: "https://example.com/gone", error: "GET https://example.com/gone failed: HTTP 404" },
  ] };
  const replay = replayContext(recording);
  assert.equal(await replay.fetchText("https://example.com/a"), "A");
  assert.equal(await replay.fetchText("https://example.com/a", { accept: "application/json" }), "A-json");
  await assert.rejects(replay.fetchText("https://example.com/gone"), (error: unknown) => error instanceof ImporterError && /HTTP 404/.test(error.message));
  await assert.rejects(replay.fetchText("https://example.com/other"), /No recorded response for https:\/\/example\.com\/other\. Record it with --record/);
  await assert.rejects(replay.fetchText("https://example.com/a", { accept: "text/html" }), /Accept: text\/html/);
  assert.deepEqual(replay.unused(), []);
  assert.deepEqual(replayContext(recording).unused().length, 3);
});

test("recordings that no longer match the importer are reported", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-recording-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stale = JSON.parse(await readFile(exampleRecording, "utf8")) as Recording;
  stale.responses.push({ url: "https://example.com/old-source.json", body: "{}" });
  const file = join(directory, "stale.json");
  await writeFile(file, JSON.stringify(stale));
  await assert.rejects(execute(exampleImporter, { replay: file }), /no longer reads: https:\/\/example\.com\/old-source\.json/);

  stale.importer = "other-importer";
  await writeFile(file, JSON.stringify(stale));
  await assert.rejects(execute(exampleImporter, { replay: file }), /Recording is for "other-importer", not "example-feed"/);
});

test("run options are checked", async () => {
  await assert.rejects(execute(exampleImporter, { record: "a.json", replay: "b.json" }), /either --record or --replay/);
  await assert.rejects(execute(exampleImporter, { now: "tomorrow", replay: exampleRecording }), /--now must be a date/);
});

test("recordings are validated", () => {
  const good: Recording = { schemaVersion: "evergreen.importer-recording.v1", importer: "x", recordedAt: "2026-10-15", responses: [{ url: "https://example.com/", body: "" }] };
  assert.doesNotThrow(() => validateRecording(good));
  for (const [name, change, expected] of [
    ["schema", { schemaVersion: "v0" }, /schemaVersion/],
    ["importer", { importer: "" }, /importer is required/],
    ["date", { recordedAt: "yesterday" }, /recordedAt must be a date/],
    ["list", { responses: {} }, /responses must be a list/],
    ["url", { responses: [{ url: "example.com", body: "" }] }, /responses\[0\]\.url must be a URL/],
    ["neither", { responses: [{ url: "https://example.com/" }] }, /exactly one of body or error/],
    ["both", { responses: [{ url: "https://example.com/", body: "", error: "x" }] }, /exactly one of body or error/],
    ["duplicate", { responses: [{ url: "https://example.com/", body: "" }, { url: "https://example.com/", body: "" }] }, /repeats/],
  ] as const) {
    assert.throws(() => validateRecording({ ...good, ...change }), expected, name);
  }
  assert.throws(() => validateRecording(null), /not an object/);
});

test("recording keeps the first and last response for repeated requests in call order", async () => {
  let calls = 0;
  const inner: ImporterContext = { now: new Date("2026-10-15T00:00:00Z"), fetchText: async () => `call ${++calls}` };
  const recorder = recordingContext(inner);
  await recorder.context.fetchText("https://example.com/same");
  await recorder.context.fetchText("https://example.com/other");
  await recorder.context.fetchText("https://example.com/same");
  const { responses } = recorder.recording("x");
  assert.deepEqual(responses.map((response) => [response.url, response.body]), [["https://example.com/same", "call 3"], ["https://example.com/other", "call 2"]]);
});

test("every committed recording is valid and named for its importer", async () => {
  const directory = resolve("tests/importers/recordings");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const recording = await readRecording(join(directory, name));
    assert.equal(`${recording.importer}.json`, name);
    if (name === "example-feed.json") assert.equal(recording.synthetic, true, "the example recording is written by hand and says so");
  }
});

test("running an importer with a replay context needs no network", async () => {
  const recording = await readRecording(exampleRecording);
  const drafts = await runImporter(exampleImporter, replayContext(recording));
  assert.equal(drafts.rules.length, 2);
});
