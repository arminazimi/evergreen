import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { ciImagesImporter } from "../../tools/importers/ci-images-1.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";
import { ImporterError } from "../../tools/importers/types.js";
import { RUNNER_IMAGES_README_URL, parseImageTable } from "../../tools/importers/runner-images.js";

const recording = resolve("tests/importers/recordings/ci-images-1.json");

test("drafts the scheduled macOS 14 rule from the recording", async () => {
  const drafts = await execute(ciImagesImporter, { replay: recording });
  assert.equal(drafts.rules.length, 1);
  const rule = drafts.rules[0]!;
  assert.equal(rule.id, "ci-images.azure-pipelines.macos-14");
  assert.equal(rule.ecosystem, "ci-images");
  assert.equal(rule.purl, "pkg:generic/azure-pipelines/macos-image");
  assert.equal(rule.vers, "vers:intdot/14");
  assert.equal(rule.event, "scheduled-end-of-life");
  assert.equal(rule.severity, "low");
  assert.equal(rule.deadline, "2026-11-02");
  assert.ok(rule.replacement);
  assert.ok(rule.replacement.includes("macos-latest") && rule.replacement.includes("macos-15"));
  assert.equal(rule.sources[0]!.url, "https://github.com/actions/runner-images/issues/13518");
  assert.deepEqual(drafts.notes, []);
});

test("the same image becomes retired on its retirement date", async () => {
  const onTheDay = await execute(ciImagesImporter, { replay: recording, now: "2026-11-02" });
  assert.equal(onTheDay.rules[0]!.id, "ci-images.azure-pipelines.macos-14");
  assert.equal(onTheDay.rules[0]!.event, "removed");
  assert.equal(onTheDay.rules[0]!.severity, "high");
});

test("an image without a deprecated badge is not drafted", async () => {
  const context: ImporterContext = {
    now: new Date("2026-10-15T12:00:00Z"),
    async fetchText(url) {
      if (url === RUNNER_IMAGES_README_URL) {
        return "# runner-images\n\n## Available Images\n\n| Image | Architecture | YAML Label |\n| --- | --- | --- |\n| Ubuntu 24.04 | x64 | `ubuntu-24.04` |\n\n### Label scheme\n";
      }
      throw new ImporterError(`GET ${url} failed: HTTP 404`);
    },
  };
  const result = await ciImagesImporter.import(context);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No image in the README is marked deprecated."]);
});

test("the recorded README has exactly the deprecated rows the importer reads", async () => {
  const recorded = (await import("node:fs/promises")).readFile;
  const body = (JSON.parse(await recorded(recording, "utf8")) as { responses: { url: string; body?: string }[] }).responses.find((response) => response.url === RUNNER_IMAGES_README_URL)!.body!;
  const deprecated = parseImageTable(body).filter((row) => row.issue !== undefined);
  assert.equal(deprecated.length, 2);
  assert.deepEqual(deprecated.flatMap((row) => row.labels).sort(), ["macos-14", "macos-14-large", "macos-14-xlarge"]);
});
