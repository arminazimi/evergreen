import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { DotnetDetector, targetVersion } from "../src/detectors/dotnet/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/dotnet");
const temporaryRoots: string[] = [];
const detector = new DotnetDetector();

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-dotnet-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/dotnet.json", "utf8"))).rules;
}

const source = (kind: "import" | "call", symbol: string, line: number, column: number, excerpt: string) => ({ kind, language: "csharp" as const, symbol, location: { path: "app/Program.cs", line, column }, excerpt });
/** What app/Program.cs in the positive fixture uses of WindowsAzure.Storage. */
const storageUsages = [
  source("import", "Microsoft.WindowsAzure.Storage", 2, 1, "using Microsoft.WindowsAzure.Storage;"),
  source("import", "Microsoft.WindowsAzure.Storage", 3, 1, "using Microsoft.WindowsAzure.Storage.Blob;"),
  source("import", "Microsoft.WindowsAzure.Storage", 4, 1, "using Az = Microsoft.WindowsAzure.Storage.Queue;"),
  source("call", "Microsoft.WindowsAzure.Storage.CloudStorageAccount.Parse", 13, 27, 'var account = CloudStorageAccount.Parse("UseDevelopmentStorage=true");'),
  source("call", "Microsoft.WindowsAzure.Storage.Blob.CloudBlobContainer", 15, 33, 'var container = new CloudBlobContainer(new Uri("https://x"));'),
  source("call", "Microsoft.WindowsAzure.Storage.Queue.CloudQueueClient", 16, 30, 'var queues = new Az.CloudQueueClient(new Uri("https://x"), null);'),
  source("call", "Microsoft.WindowsAzure.Storage.Table.CloudTableClient", 17, 30, 'var tables = new Microsoft.WindowsAzure.Storage.Table.CloudTableClient(new Uri("https://x"), null);'),
];

async function expected(ruleId: string, path: string, line: number, summary: (rule: RegistryV2Rule) => string): Promise<DetectorFinding> {
  const rule = (await committedRules()).find((item) => item.id === ruleId)!;
  // A rule with usage matchers reports where the source uses the package, even when nowhere.
  const usage = (rule.usage ?? []).length > 0 ? { usages: storageUsages, impact: { usageCount: 7, affectedFiles: 1, level: "medium" as const } } : {};
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: summary(rule),
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    migration: rule.migration!,
    sources: rule.sources,
    ...usage,
  };
}

test("dotnet passes detector conformance on every fixture", async () => {
  const runtime = (line: string, path: string, at: number, text: string) => expected(`dotnet.runtime.end-of-support-${line}`, path, at, (rule) => `${path} ${text}. ${rule.summary}`);
  const storage = (path: string, at: number, suffix = "") => expected("dotnet.package.windowsazure-storage.deprecated", path, at, (rule) => `${path} references WindowsAzure.Storage 9.3.3${suffix}. ${rule.summary}`);
  await runDetectorConformance({
    detector,
    fixtures: [
      {
        name: "dotnet positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          runtime("3.1", "app/App.csproj", 5, "targets netcoreapp3.1"),
          storage("app/App.csproj", 10),
          runtime("6.0", "central/Directory.Build.props", 4, "targets net6.0"),
          storage("central/Directory.Packages.props", 4, " (central package version)"),
          runtime("3.1", "global.json", 3, "pins .NET SDK 3.1.426"),
          runtime("6.0", "lib/Lib.fsproj", 4, "targets net6.0"),
          runtime("8.0", "lib/Lib.fsproj", 4, "targets net8.0"),
          runtime("5.0", "lib/Win.vbproj", 4, "targets net5.0-windows"),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [
      { name: "dotnet negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "dotnet zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [{ name: "dotnet malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("target framework monikers: runtimes are versions, netstandard is ignored, the rest is unclassified", () => {
  assert.deepEqual(targetVersion("netcoreapp3.1"), { kind: "version", version: "3.1.0" });
  assert.deepEqual(targetVersion("net6.0"), { kind: "version", version: "6.0.0" });
  assert.deepEqual(targetVersion("net5.0-windows10.0.19041"), { kind: "version", version: "5.0.0" });
  assert.deepEqual(targetVersion("NET8.0"), { kind: "version", version: "8.0.0" });
  assert.deepEqual(targetVersion("netstandard2.0"), { kind: "ignored" });
  for (const moniker of ["net48", "net472", "net461-windows", "$(Tfm)", "uap10.0", "monoandroid13.0", "net4.0"]) {
    assert.equal(targetVersion(moniker).kind, "unclassified", moniker);
  }
});

test("dynamic and .NET Framework targets are listed as unclassified with their lines, and never judged", async () => {
  const analysis = await detector.analyze({ root: resolve(fixtures, "negative") });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reference]), [
    ["Dynamic.csproj", 5, "$(Tfm)"],
    ["Dynamic.csproj", 11, "$(StorageVersion)"],
    ["Targets.csproj", 4, "net48"],
  ]);
});

test("an SDK pin that is not a version is unclassified, a supported SDK is not reported, and a missing pin is nothing", async () => {
  const root = await repository({
    "a/global.json": '{ "sdk": { "version": "latest" } }',
    "b/global.json": '{ "sdk": { "version": "10.0.100" } }',
    "c/global.json": '{ "sdk": { "version": "6.0.400" } }',
    "d/global.json": '{ "sdk": {} }',
  });
  const analysis = await detector.analyze({ root });
  assert.deepEqual(analysis.findings.map((finding) => [finding.ruleId, finding.location.path]), [["dotnet.runtime.end-of-support-6.0", "c/global.json"]]);
  assert.deepEqual(analysis.unclassified.map((item) => item.location.path), ["a/global.json"]);
});

test("a package reference with a property, floating, or range version is unclassified; no version needs central management", async () => {
  const project = (items: string) => `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>\n${items}\n</ItemGroup></Project>`;
  const root = await repository({
    "a/A.csproj": project('<PackageReference Include="windowsazure.storage" Version="$(V)" />\n<PackageReference Include="WindowsAzure.Storage" Version="9.*" />\n<PackageReference Include="WindowsAzure.Storage" Version="[9.0,10.0)" />\n<PackageReference Include="WindowsAzure.Storage" />'),
    "b/B.csproj": project('<PackageReference Include="WindowsAzure.Storage" />'),
    "b/Directory.Build.props": "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup></Project>",
  });
  const analysis = await detector.analyze({ root });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reference]), [
    ["a/A.csproj", 2, "$(V)"],
    ["a/A.csproj", 3, "9.*"],
    ["a/A.csproj", 4, "[9.0,10.0)"],
    ["a/A.csproj", 5, "WindowsAzure.Storage"],
  ]);
});

test("package ids match without regard to case, and only for packages that have a rule", async () => {
  const root = await repository({ "A.csproj": '<Project><ItemGroup><PackageReference Include="windowsazure.STORAGE" Version="9.3.3" /><PackageReference Include="Serilog" Version="3.1.1" /></ItemGroup></Project>' });
  assert.deepEqual((await detector.scan({ root })).map((finding) => [finding.ruleId, finding.location.line]), [["dotnet.package.windowsazure-storage.deprecated", 1]]);
});

const removedRule: RegistryV2Rule = {
  id: "dotnet.package.example.removed",
  ecosystem: "dotnet",
  purl: "pkg:nuget/Example.Package",
  vers: "vers:nuget/1.0.0|1.0.1",
  event: "removed",
  title: "Two versions of Example.Package were withdrawn",
  summary: "The publisher withdrew these versions.",
  severity: "medium",
  replacement: "A later version of Example.Package",
  sources: [{ title: "Example.Package", url: "https://www.nuget.org/packages/Example.Package" }],
  provenance: { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "test" },
};

test("a rule for specific versions is reported where the lock file resolves a direct dependency, not for a transitive one", async () => {
  const lock = (type: string, version: string) => JSON.stringify({ version: 1, dependencies: { "net8.0": { "Example.Package": { type, resolved: version } } } }, null, 2);
  const hit = await repository({ "packages.lock.json": lock("Direct", "1.0.1") });
  const findings = await new DotnetDetector(async () => [removedRule]).scan({ root: hit });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [["packages.lock.json", 7]]);
  assert.match(findings[0]!.summary, /packages\.lock\.json resolves Example\.Package 1\.0\.1/);
  for (const [type, version] of [["Transitive", "1.0.1"], ["Direct", "1.0.2"]] as const) {
    const root = await repository({ "packages.lock.json": lock(type, version) });
    assert.deepEqual(await new DotnetDetector(async () => [removedRule]).scan({ root }), [], `${type} ${version}`);
  }
});

test("bin, obj, vendored, and fixture directories and symbolic links are skipped, and a repository without .NET files is empty", async () => {
  const project = '<Project><PropertyGroup><TargetFramework>net6.0</TargetFramework></PropertyGroup></Project>';
  const root = await repository({
    "src/App/App.csproj": project,
    "src/App/bin/Debug/App.csproj": project,
    "src/App/obj/App.csproj": project,
    "vendor/x/X.csproj": project,
    "tests/fixtures/old/Old.csproj": project,
  });
  await symlink(join(root, "src"), join(root, "linked")).catch(() => undefined);
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.location.path), ["src/App/App.csproj"]);
  assert.deepEqual(await detector.analyze({ root: await repository({ "README.md": "hello" }) }), { findings: [], unclassified: [] });
});

test("one moniker listed twice on a line is one finding", async () => {
  const root = await repository({ "A.csproj": "<Project><PropertyGroup><TargetFrameworks>net6.0;net6.0-windows</TargetFrameworks></PropertyGroup></Project>" });
  assert.equal((await detector.scan({ root })).length, 1);
});

test("every curated .NET rule has migration guidance with real verification commands", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.some((check) => check.command === "dotnet build && dotnet test"), rule.id);
  }
});

test("a migration packet for a .NET runtime finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [detector]);
  const runtime = result.findings.find((finding) => finding.id === "dotnet.runtime.end-of-support-3.1:app/App.csproj:5");
  assert.ok(runtime);
  const packet = validateMigrationPacket(createMigrationPacket(result, runtime.id));
  assert.ok(packet.affectedFiles.includes("app/App.csproj"));
  assert.ok(packet.steps.some((step) => step.id === "raise-target-framework"));
  assert.ok(packet.steps.some((step) => step.id === "raise-sdk-pin"));
  assert.ok(packet.verification.some((check) => check.command === "dotnet --list-sdks && dotnet --list-runtimes"));
  assert.ok(packet.verification.some((check) => check.command === "dotnet build && dotnet test"));
});

test("a migration packet for a deprecated package lists the C# files that use it", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [detector]);
  const storage = result.findings.find((finding) => finding.id === "dotnet.package.windowsazure-storage.deprecated:app/App.csproj:10");
  assert.ok(storage);
  const packet = validateMigrationPacket(createMigrationPacket(result, storage.id));
  assert.ok(packet.affectedFiles.includes("app/App.csproj"));
  assert.ok(packet.affectedFiles.includes("app/Program.cs"), "the source file that uses the package is listed");
  assert.ok(packet.steps.some((step) => step.id === "replace-windowsazure-storage"));
  assert.ok(packet.verification.some((check) => check.command === "dotnet build && dotnet test"));
});

test("a line whose end is announced is reported at low severity, not as already over", async () => {
  const root = await repository({ "global.json": '{ "sdk": { "version": "8.0.404" } }', "A.csproj": "<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>" });
  const findings = await detector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.severity, finding.deadline, finding.location.path]), [
    ["dotnet.runtime.end-of-support-9.0", "low", "2026-11-10", "A.csproj"],
    ["dotnet.runtime.end-of-support-8.0", "low", "2026-11-10", "global.json"],
  ]);
  assert.match(findings[0]!.title, /reaches end of support on 2026-11-10/);
});
