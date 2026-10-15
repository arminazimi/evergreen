import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";
import { parseImageTable, parseLongDate, RUNNER_IMAGES_README_URL, runnerImagesImporter } from "../../tools/importers/runner-images.js";

const recording = resolve("tests/importers/recordings/runner-images.json");
const API = "application/vnd.github+json";

const readme = (rows: string[]) => `# runner-images\n\n## Available Images\n\n| Image | Architecture | YAML Label | Included Software |\n| ---|---|---|---|\n${rows.join("\n")}\n\n### Label scheme\n\n| not | part | of | the table |\n`;
const row = (image: string, labels: string[], issue?: number, badge = "deprecated") =>
  `| ${image}${issue ? ` [![${badge}](https://img.shields.io/badge/${badge}-E5534B)](https://github.com/actions/runner-images/issues/${issue})` : ""}<br>![Endpoint Badge](https://img.shields.io/endpoint?url=x) | x64 | ${labels.map((label) => `\`${label}\``).join(", ")} | [${image}] |`;

function github(pages: { readme: string; issues?: Record<number, { title?: string; body?: string } | Error> }, now = "2026-10-15"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      if (url === RUNNER_IMAGES_README_URL) return pages.readme;
      const issue = /^https:\/\/api\.github\.com\/repos\/actions\/runner-images\/issues\/(\d+)$/.exec(url)?.[1];
      assert.ok(issue, `unexpected URL ${url}`);
      assert.equal(options?.accept, API);
      const value = pages.issues?.[Number(issue)];
      if (value instanceof Error) throw value;
      if (!value) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      return JSON.stringify({ html_url: `https://github.com/actions/runner-images/issues/${issue}`, ...value });
    },
  };
}

const announcement = (target: string) => ({ title: "[macOS] The macOS 14 images will be retired", body: `### Breaking changes\n\ntext\n\n### Target date\n\n${target}\n\n### The motivation for the changes\n\nwhy\n` });

test("drafts a rule for the deprecated image family in the recorded README and announcement", async () => {
  const drafts = await execute(runnerImagesImporter, { replay: recording });
  assert.equal(drafts.rules.length, 1);
  const rule = drafts.rules[0]!;
  assert.equal(rule.id, "github-runners.macos-14");
  assert.equal(rule.ecosystem, "github-runners");
  assert.equal(rule.purl, "pkg:generic/github-runner/macos-14");
  assert.equal(rule.vers, "vers:semver/*");
  assert.equal(rule.event, "deprecated");
  assert.equal(rule.title, "macOS 14 runner images are deprecated");
  assert.equal(rule.summary, "GitHub deprecated the macOS 14 runner images from 2026-07-06 and retires them on 2026-11-02. Jobs that use `macos-14`, `macos-14-large`, `macos-14-xlarge` stop running once the images are retired.");
  assert.equal(rule.deadline, "2026-11-02");
  assert.deepEqual(rule["x-github-runners"], { labels: ["macos-14", "macos-14-large", "macos-14-xlarge"] });
  assert.equal(rule.sources[0]!.url, "https://github.com/actions/runner-images/issues/13518");
  assert.deepEqual(drafts.notes, []);
});

test("an image is retired on its retirement date", async () => {
  const before = await execute(runnerImagesImporter, { replay: recording, now: "2026-11-01" });
  assert.equal(before.rules[0]!.event, "deprecated");
  const onTheDay = await execute(runnerImagesImporter, { replay: recording, now: "2026-11-02" });
  assert.equal(onTheDay.rules[0]!.event, "removed");
  assert.equal(onTheDay.rules[0]!.title, "macOS 14 runner images are retired");
  assert.equal(onTheDay.rules[0]!.summary, "GitHub deprecated the macOS 14 runner images from 2026-07-06 and retired them on 2026-11-02. Jobs that use `macos-14`, `macos-14-large`, `macos-14-xlarge` no longer run.");
});

test("reads the image table: names, labels, and the announcement behind a deprecated badge", async () => {
  const text = await readFile(resolve("tests/importers/recordings/runner-images.json"), "utf8");
  const recorded = (JSON.parse(text) as { responses: { url: string; body?: string }[] }).responses.find((response) => response.url === RUNNER_IMAGES_README_URL)!.body!;
  const rows = parseImageTable(recorded);
  assert.ok(rows.length >= 10);
  const macos = rows.filter((entry) => entry.image.startsWith("macOS 14"));
  assert.deepEqual(macos.map((entry) => [entry.image, entry.issue]), [["macOS 14", 13518], ["macOS 14 Arm64", 13518]]);
  assert.deepEqual(macos.flatMap((entry) => entry.labels).sort(), ["macos-14", "macos-14-large", "macos-14-xlarge"]);
  assert.equal(rows.find((entry) => entry.image === "Ubuntu 24.04")!.issue, undefined);
  assert.ok(rows.find((entry) => entry.image === "Ubuntu 24.04")!.labels.includes("ubuntu-latest"));
  assert.ok(rows.every((entry) => entry.labels.length > 0), "every image lists at least one label");
});

test("a preview badge is not a deprecation", () => {
  const rows = parseImageTable(readme([row("Xcode 27", ["xcode-27"], 14404, "preview"), row("macOS 15", ["macos-15"])]));
  assert.deepEqual(rows.map((entry) => entry.issue), [undefined, undefined]);
});

test("reads long-form dates and rejects what is not a date", () => {
  assert.equal(parseLongDate("July 6th, 2026"), "2026-07-06");
  assert.equal(parseLongDate("November 2nd, 2026"), "2026-11-02");
  assert.equal(parseLongDate("March 3rd, 2027"), "2027-03-03");
  assert.equal(parseLongDate("March 1, 2027"), "2027-03-01");
  assert.equal(parseLongDate("Retirement: December 31st, 2026."), "2026-12-31");
  for (const value of ["", "soon", "Foo 3rd, 2026", "February 30th, 2026", "2026-11-02", "November 2nd"]) assert.equal(parseLongDate(value), undefined, value);
});

test("drafts what the announcement states and no more", async () => {
  const pages = (target: string) => ({ readme: readme([row("Ubuntu 20.04", ["ubuntu-20.04"], 7)]), issues: { 7: announcement(target) } });
  const only = await runImporter(runnerImagesImporter, github(pages("Retirement: April 1st, 2027")));
  assert.equal(only.rules[0]!.deadline, "2027-04-01");
  assert.match(only.rules[0]!.summary, /^GitHub retires the Ubuntu 20\.04 runner images on 2027-04-01\./);

  const start = await runImporter(runnerImagesImporter, github(pages("Deprecation: April 1st, 2027")));
  assert.equal(start.rules[0]!.deadline, undefined, "no retirement date, so no deadline");
  assert.match(start.rules[0]!.summary, /^GitHub deprecated the Ubuntu 20\.04 runner images from 2027-04-01\./);

  const none = await runImporter(runnerImagesImporter, github({ readme: readme([row("Ubuntu 20.04", ["ubuntu-20.04"], 7)]), issues: { 7: { title: "t", body: "no target date section" } } }));
  assert.deepEqual(none.rules, []);
  assert.deepEqual(none.notes, ["Skipped Ubuntu 20.04 (issue #7): its announcement has no readable Target date section."]);
});

test("says so when no image is deprecated", async () => {
  const result = await runImporter(runnerImagesImporter, github({ readme: readme([row("Ubuntu 24.04", ["ubuntu-24.04"])]) }));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No image in the README is marked deprecated."]);
});

test("one announcement covering several rows gives one rule with every label", async () => {
  const result = await runImporter(runnerImagesImporter, github({
    readme: readme([row("macOS 13", ["macos-13-large"], 9), row("macOS 13 Arm64", ["macos-13", "macos-13-xlarge"], 9), row("Windows Server 2019", ["windows-2019"], 10)]),
    issues: { 9: announcement("Retirement: December 4th, 2026"), 10: announcement("Retirement: June 30th, 2027") },
  }));
  assert.deepEqual(result.rules.map((rule) => [rule.id, rule["x-github-runners"]]), [
    ["github-runners.macos-13", { labels: ["macos-13", "macos-13-large", "macos-13-xlarge"] }],
    ["github-runners.windows-server-2019", { labels: ["windows-2019"] }],
  ]);
});

test("fails loudly when the README cannot be read or the announcement cannot be fetched", async () => {
  await assert.rejects(runImporter(runnerImagesImporter, github({ readme: "# nothing here" })), /no Available Images table/);
  await assert.rejects(
    runImporter(runnerImagesImporter, github({ readme: readme([row("macOS 14", ["macos-14"], 3)]), issues: { 3: new ImporterError("GET x failed: HTTP 403") } })),
    /HTTP 403/,
  );
});
