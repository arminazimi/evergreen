import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseGlobalJson } from "../src/detectors/dotnet/parse-global-json.js";
import { parseMsbuild } from "../src/detectors/dotnet/parse-msbuild.js";
import { parsePackagesLock } from "../src/detectors/dotnet/parse-packages-lock.js";

const read = (path: string): string => readFileSync(join("tests", "fixtures", "dotnet", path), "utf8");

test("global.json: the pinned SDK version and its line", () => {
  assert.deepEqual(parseGlobalJson(read("positive/global.json")), [{ value: "3.1.426", line: 3 }]);
  assert.deepEqual(parseGlobalJson(read("zero/global.json")), [{ value: "10.0.100", line: 3 }]);
});

test("global.json: msbuild-sdks, a missing version, comments, and malformed input pin nothing", () => {
  assert.deepEqual(parseGlobalJson(read("negative/global.json")), []);
  assert.deepEqual(parseGlobalJson(read("malformed/global.json")), []);
  assert.deepEqual(parseGlobalJson(""), []);
  assert.deepEqual(parseGlobalJson('{ "sdk": { "version": 6 } }'), []);
  assert.deepEqual(parseGlobalJson('// pinned\n{\n  /* sdk */ "sdk": { "version": "6.0.100" }\n}'), [{ value: "6.0.100", line: 3 }]);
  assert.deepEqual(parseGlobalJson('﻿{"sdk":{"version":"6.0.100"}}'), [{ value: "6.0.100", line: 1 }]);
});

test("project files: targets and packages with exact lines", () => {
  const app = parseMsbuild(read("positive/app/App.csproj"));
  assert.deepEqual(app.targets, [{ value: "netcoreapp3.1", line: 5 }]);
  assert.deepEqual(app.packages, [
    { kind: "reference", name: "WindowsAzure.Storage", version: "9.3.3", line: 10 },
    { kind: "reference", name: "Newtonsoft.Json", version: "13.0.3", line: 11 },
    { kind: "reference", name: "Microsoft.Extensions.Logging", version: "5.2.0", line: 13 },
  ]);
  assert.deepEqual(parseMsbuild(read("positive/lib/Lib.fsproj")).targets, [
    { value: "netstandard2.0", line: 4 },
    { value: "net6.0", line: 4 },
    { value: "net8.0", line: 4 },
  ]);
  assert.deepEqual(parseMsbuild(read("positive/lib/Win.vbproj")).targets, [{ value: "net5.0-windows", line: 4 }]);
});

test("Directory.Build.props and Directory.Packages.props", () => {
  const build = parseMsbuild(read("positive/central/Directory.Build.props"));
  assert.deepEqual(build.targets, [{ value: "net6.0", line: 4 }]);
  assert.equal(build.centralPackageManagement, true);
  assert.deepEqual(parseMsbuild(read("positive/central/Directory.Packages.props")).packages, [
    { kind: "version", name: "WindowsAzure.Storage", version: "9.3.3", line: 4 },
    { kind: "version", name: "Serilog", version: "3.1.1", line: 5 },
  ]);
});

test("project files: comments, prose, conditions, and a missing version are not declarations", () => {
  const dynamic = parseMsbuild(read("negative/Dynamic.csproj"));
  assert.deepEqual(dynamic.targets, [{ value: "$(Tfm)", line: 5 }]);
  assert.deepEqual(dynamic.packages, [
    { kind: "reference", name: "WindowsAzure.Storage", version: "$(StorageVersion)", line: 11 },
    { kind: "reference", name: "Microsoft.Extensions.Logging", version: "5.*", line: 12 },
    { kind: "reference", name: "Serilog", version: "[3.0,4.0)", line: 13 },
    { kind: "reference", name: "Unversioned", line: 15 },
  ]);
  const conditional = parseMsbuild(
    '<Project>\n<PropertyGroup Condition="\'$(X)\'==\'1\'">\n<TargetFramework>net6.0</TargetFramework>\n</PropertyGroup>\n<ItemGroup>\n<PackageReference Include="A" Version="1.0.0" Condition="false" />\n</ItemGroup>\n</Project>',
  );
  assert.deepEqual(conditional, { targets: [], packages: [], centralPackageManagement: false });
});

test("project files: malformed or non-project XML returns nothing", () => {
  for (const name of ["Broken.csproj", "Directory.Packages.props"]) {
    assert.deepEqual(parseMsbuild(read(`malformed/${name}`)), { targets: [], packages: [], centralPackageManagement: false }, name);
  }
  assert.deepEqual(parseMsbuild("<Other><TargetFramework>net6.0</TargetFramework></Other>").targets, []);
  assert.deepEqual(parseMsbuild("<Project><PropertyGroup></Project>").targets, []);
  assert.deepEqual(parseMsbuild("").targets, []);
});

test("project files: attributes spanning lines and entities", () => {
  const parsed = parseMsbuild('<Project>\n<ItemGroup>\n<PackageReference\n  Include="A&amp;B"\n  Version="1.0.0"\n/>\n</ItemGroup>\n</Project>');
  assert.deepEqual(parsed.packages, [{ kind: "reference", name: "A&B", version: "1.0.0", line: 5 }]);
});

test("project files: oversized input and deep nesting are refused", () => {
  assert.deepEqual(parseMsbuild(`<Project>${" ".repeat(1024 * 1024 + 1)}</Project>`).targets, []);
  assert.deepEqual(parseMsbuild(`${"<a>".repeat(200)}${"</a>".repeat(200)}`).targets, []);
});

test("packages.lock.json: only Direct dependencies, with the line of the resolved version", () => {
  assert.deepEqual(parsePackagesLock(read("positive/lock/packages.lock.json")), [
    { name: "WindowsAzure.Storage", version: "9.3.3", framework: "net6.0", line: 8 },
  ]);
  assert.deepEqual(parsePackagesLock(read("negative/packages.lock.json")), []);
  assert.deepEqual(parsePackagesLock(read("malformed/packages.lock.json")), []);
  assert.deepEqual(parsePackagesLock("{ not json"), []);
});
