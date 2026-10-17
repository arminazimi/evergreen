import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/dotnet.json", "utf8"))).rules;
}

test("the .NET registry has five valid rules, each citing an authoritative source", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(
      rule.sources.some((source) => /^https:\/\/(?:dotnet\.microsoft\.com\/platform\/support\/policy\/dotnet-core|dotnetcli\.blob\.core\.windows\.net\/dotnet\/release-metadata\/releases-index\.json|www\.nuget\.org\/packages\/WindowsAzure\.Storage)$/.test(source.url)),
      `${rule.id} cites the .NET policy, the releases index, or the package's NuGet page`,
    );
  }
});

test("each runtime rule covers its own release line, runtimes and SDKs alike, and nothing else", async () => {
  const runtime = (await rules()).filter((rule) => rule.purl === "pkg:generic/dotnet");
  assert.deepEqual(runtime.map((rule) => [rule.id, rule.deadline]).sort(), [
    ["dotnet.runtime.end-of-support-3.1", "2022-12-13"],
    ["dotnet.runtime.end-of-support-5.0", "2022-05-10"],
    ["dotnet.runtime.end-of-support-6.0", "2024-11-12"],
    ["dotnet.runtime.end-of-support-7.0", "2024-05-14"],
  ]);
  const affected = (version: string) => runtime.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id.replace("dotnet.runtime.end-of-support-", ""));
  for (const [version, lines] of [["3.1.0", ["3.1"]], ["3.1.426", ["3.1"]], ["5.0.0", ["5.0"]], ["6.0.400", ["6.0"]], ["7.0.20", ["7.0"]], ["8.0.0", []], ["9.0.100", []], ["10.0.100", []], ["2.1.818", []]] as const) {
    assert.deepEqual(affected(version), lines, version);
  }
  for (const rule of runtime) assert.equal(rule.event, "end-of-support");
});

test("the package rule matches every version of WindowsAzure.Storage, including four-part versions", async () => {
  const rule = (await rules()).find((candidate) => candidate.purl === "pkg:nuget/WindowsAzure.Storage")!;
  assert.equal(rule.event, "deprecated");
  assert.equal(rule.deadline, "2023-03-31");
  for (const version of ["1.0.0.0", "9.3.3", "9.4.0-preview"]) assert.ok(versContains(rule.vers, version), version);
});
