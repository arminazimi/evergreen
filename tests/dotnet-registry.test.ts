import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/dotnet.json", "utf8"))).rules;
}

test("the .NET registry has sixteen valid rules, each citing an authoritative source", async () => {
  const all = await rules();
  assert.equal(all.length, 16);
  for (const rule of all) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(
      rule.sources.some((source) => /^https:\/\/(?:dotnet\.microsoft\.com\/platform\/support\/policy\/dotnet-core|dotnetcli\.blob\.core\.windows\.net\/dotnet\/release-metadata\/releases-index\.json|www\.nuget\.org\/packages\/(?:WindowsAzure\.Storage|Microsoft\.Azure\.(?:DocumentDB|ServiceBus|Storage\.Blob)))$/.test(source.url)),
      `${rule.id} cites the .NET policy, the releases index, or the package's NuGet page`,
    );
  }
});

test("each runtime rule covers its own release line, runtimes and SDKs alike, and nothing else", async () => {
  const runtime = (await rules()).filter((rule) => rule.purl === "pkg:generic/dotnet");
  assert.deepEqual(runtime.map((rule) => [rule.id, rule.deadline]).sort(), [
    ["dotnet.runtime.end-of-support-1.0", "2019-06-27"],
    ["dotnet.runtime.end-of-support-1.1", "2019-06-27"],
    ["dotnet.runtime.end-of-support-2.0", "2018-10-01"],
    ["dotnet.runtime.end-of-support-2.1", "2021-08-21"],
    ["dotnet.runtime.end-of-support-2.2", "2019-12-23"],
    ["dotnet.runtime.end-of-support-3.0", "2020-03-03"],
    ["dotnet.runtime.end-of-support-3.1", "2022-12-13"],
    ["dotnet.runtime.end-of-support-5.0", "2022-05-10"],
    ["dotnet.runtime.end-of-support-6.0", "2024-11-12"],
    ["dotnet.runtime.end-of-support-7.0", "2024-05-14"],
    ["dotnet.runtime.end-of-support-8.0", "2026-11-10"],
    ["dotnet.runtime.end-of-support-9.0", "2026-11-10"],
  ]);
  const affected = (version: string) => runtime.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id.replace("dotnet.runtime.end-of-support-", ""));
  for (const [version, lines] of [["3.1.0", ["3.1"]], ["3.1.426", ["3.1"]], ["5.0.0", ["5.0"]], ["6.0.400", ["6.0"]], ["7.0.20", ["7.0"]], ["8.0.0", ["8.0"]], ["8.0.404", ["8.0"]], ["9.0.100", ["9.0"]], ["10.0.100", []], ["2.1.818", ["2.1"]], ["2.2.402", ["2.2"]], ["3.0.103", ["3.0"]], ["1.0.16", ["1.0"]], ["1.1.13", ["1.1"]], ["2.0.9", ["2.0"]], ["4.0.0", []]] as const) {
    assert.deepEqual(affected(version), lines, version);
  }
  for (const rule of runtime) {
    // 8.0 and 9.0 are announced, not over (decision 0010): a low-severity warning until their date has passed and a reviewer promotes them.
    const scheduled = rule.id.endsWith("8.0") || rule.id.endsWith("9.0");
    assert.equal(rule.event, scheduled ? "scheduled-end-of-life" : "end-of-support", rule.id);
    assert.equal(rule.severity, scheduled ? "low" : "high", rule.id);
  }
});

test("the package rule matches every version of WindowsAzure.Storage, including four-part versions", async () => {
  const rule = (await rules()).find((candidate) => candidate.purl === "pkg:nuget/WindowsAzure.Storage")!;
  assert.equal(rule.event, "deprecated");
  assert.equal(rule.deadline, "2023-03-31");
  for (const version of ["1.0.0.0", "9.3.3", "9.4.0-preview"]) assert.ok(versContains(rule.vers, version), version);
});

test("each deprecated NuGet package rule matches every version and names its replacement", async () => {
  const packages = (await rules()).filter((rule) => rule.purl.startsWith("pkg:nuget/"));
  assert.deepEqual(
    packages.map((rule) => [rule.purl, rule.deadline, rule.replacement]).sort(),
    [
      ["pkg:nuget/Microsoft.Azure.DocumentDB", "2023-03-31", "Microsoft.Azure.Cosmos"],
      ["pkg:nuget/Microsoft.Azure.ServiceBus", "2026-09-30", "Azure.Messaging.ServiceBus"],
      ["pkg:nuget/Microsoft.Azure.Storage.Blob", "2023-03-31", "Azure.Storage.Blobs"],
      ["pkg:nuget/WindowsAzure.Storage", "2023-03-31", "Azure.Storage.Blobs, Azure.Storage.Queues, Azure.Storage.Files.Shares, or Azure.Data.Tables, with Azure.Storage.Common"],
    ],
  );
  for (const rule of packages) {
    assert.equal(rule.event, "deprecated", rule.id);
    assert.ok(versContains(rule.vers, "1.0.0"), rule.id);
    assert.ok(rule.usage && rule.usage.length > 0, `${rule.id} lists the source usage that a migration touches`);
  }
});
