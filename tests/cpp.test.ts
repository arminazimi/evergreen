import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { CppDetector, cppDetector } from "../src/detectors/cpp/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/cpp");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cpp-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/cpp.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

/** A registry rule for one package, so a test can show how a declaration is matched. */
function injectedRule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "cpp.package.example.deprecated",
    ecosystem: "cpp",
    purl: "pkg:conan/zlib",
    vers: "vers:semver/<2.0.0",
    event: "deprecated",
    title: "example is deprecated",
    summary: "The maintainer retired the package.",
    severity: "medium",
    replacement: "a maintained release",
    sources: [{ title: "Example retirement notice", url: "https://example.com/zlib" }],
    provenance: { observedAt: "2026-10-20", reviewedAt: "2026-10-20", reviewer: "test" },
    ...overrides,
  };
}

test("cpp passes detector conformance on every fixture", async () => {
  const removed = (await committedRules()).find((rule) => rule.id === "cpp.cmake.policy-below-3.5.removed")!;
  await runDetectorConformance({
    detector: cppDetector,
    fixtures: [
      {
        name: "cpp positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(removed, "CMakeLists.txt", 1, `CMakeLists.txt declares cmake_minimum_required 3.4. ${removed.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: cppDetector,
    fixtures: [
      { name: "cpp negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "cpp zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: cppDetector,
    fixtures: [{ name: "cpp malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("matches a cmake_minimum_required in the deprecation band and ignores a current policy floor", async () => {
  const deprecated = await cppDetector.scan({ root: await repository({ "CMakeLists.txt": "cmake_minimum_required(VERSION 3.8)\n" }) });
  assert.deepEqual(deprecated.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["cpp.cmake.policy-below-3.10.deprecated", "CMakeLists.txt", 1]]);
  assert.match(deprecated[0]!.summary, /^CMakeLists\.txt declares cmake_minimum_required 3\.8\./);

  assert.deepEqual(await cppDetector.scan({ root: await repository({ "CMakeLists.txt": "cmake_minimum_required(VERSION 3.16)\n" }) }), []);
  assert.deepEqual(await cppDetector.scan({ root: await repository({ "CMakeLists.txt": "cmake_minimum_required(VERSION 3.31)\n" }) }), []);
});

test("the first matching rule wins, and a malformed VERS does not hide a later rule", async () => {
  const removed = (await committedRules()).find((rule) => rule.id === "cpp.cmake.policy-below-3.5.removed")!;
  const earlier = { ...removed, id: "cpp.cmake.policy-below-3.5.earlier", vers: "vers:semver/<9.0.0" };
  const malformed = { ...removed, id: "cpp.cmake.malformed", vers: "not-a-vers" };
  const detector = new CppDetector(async () => [malformed, earlier, removed]);
  const findings = await detector.scan({ root: await repository({ "CMakeLists.txt": "cmake_minimum_required(VERSION 3.4)\n" }) });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["cpp.cmake.policy-below-3.5.earlier"]);
});

test("a rule whose Package URL cannot be read never matches and does not fail the scan", async () => {
  const detector = new CppDetector(async () => [injectedRule({ purl: "not a purl" })]);
  const root = await repository({ "conanfile.txt": "[requires]\nzlib/1.2.13\n" });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("matches a Conan requirement in conanfile.txt and conanfile.py by pkg:conan/<name>", async () => {
  const detector = new CppDetector(async () => [injectedRule()]);
  const text = await repository({ "conanfile.txt": "[requires]\nzlib/1.2.13\nopenssl/1.1.1t\n" });
  assert.deepEqual((await detector.scan({ root: text })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["cpp.package.example.deprecated", "conanfile.txt", 2]]);

  const python = await repository({ "conanfile.py": 'requires = "zlib/1.2.13", "openssl/1.1.1t"\n' });
  const findings = await detector.scan({ root: python });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [["cpp.package.example.deprecated", 1]]);
  assert.match(findings[0]!.summary, /conanfile\.py requires zlib 1\.2\.13\./);
});

test("matches a vcpkg version floor, a name-only dependency only against every version, and a baseline commit", async () => {
  const floor = injectedRule({ id: "cpp.vcpkg.zlib.deprecated", purl: "pkg:vcpkg/zlib" });
  const universal = injectedRule({ id: "cpp.vcpkg.fmt.removed", purl: "pkg:vcpkg/fmt", vers: "vers:semver/*" });
  const baselineRange = injectedRule({ id: "cpp.vcpkg.baseline.range", purl: "pkg:generic/vcpkg-baseline", vers: "vers:semver/<1.0.0" });
  const baselineAll = injectedRule({ id: "cpp.vcpkg.baseline.all", purl: "pkg:generic/vcpkg-baseline", vers: "vers:semver/*" });
  const detector = new CppDetector(async () => [floor, universal, baselineRange, baselineAll]);
  const root = await repository({
    "vcpkg.json": [
      "{",
      '  "builtin-baseline": "664933b8d385dfc01f4e0cdff4c7c74e71f6a740",',
      '  "dependencies": ["fmt", { "name": "zlib", "version>=": "1.2.13" }]',
      "}",
      "",
    ].join("\n"),
  });
  const findings = await detector.scan({ root });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.line]),
    [
      ["cpp.vcpkg.baseline.all", 2],
      ["cpp.vcpkg.fmt.removed", 3],
      ["cpp.vcpkg.zlib.deprecated", 3],
    ],
  );
  assert.match(findings[0]!.summary, /pins builtin-baseline 664933b8d385dfc01f4e0cdff4c7c74e71f6a740\./);
  assert.match(findings[1]!.summary, /depends on fmt\./);
  assert.match(findings[2]!.summary, /requires zlib 1\.2\.13 or newer\./);
});

test("matches a language standard and a compiler check only when a rule names that Package URL", async () => {
  const standard = injectedRule({ id: "cpp.standard.cxx.deprecated", purl: "pkg:generic/cxx-standard", vers: "vers:semver/<18.0.0" });
  const compiler = injectedRule({ id: "cpp.compiler.gnu.deprecated", purl: "pkg:generic/cxx-compiler/gnu", vers: "vers:semver/<10.0.0" });
  const detector = new CppDetector(async () => [standard, compiler]);
  const root = await repository({
    "CMakeLists.txt": [
      "set(CMAKE_C_STANDARD 99)",
      "set(CMAKE_CXX_STANDARD 17)",
      'if(CMAKE_C_COMPILER_ID STREQUAL "GNU" AND CMAKE_C_COMPILER_VERSION VERSION_LESS 9.3)',
      "endif()",
      'if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)',
      "endif()",
      "",
    ].join("\n"),
  });
  const findings = await detector.scan({ root });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.line]),
    [
      ["cpp.standard.cxx.deprecated", 2],
      ["cpp.compiler.gnu.deprecated", 5],
    ],
  );
  assert.match(findings[0]!.summary, /sets CMAKE_CXX_STANDARD 17\./);
  assert.match(findings[1]!.summary, /checks GNU VERSION_LESS 9\.3 for C\+\+\./);
});

test("walks nested manifests and skips symlinks, vendored directories, and depth past eight", async () => {
  const deep = [...Array(9).keys()].map((index) => `d${index}`).join("/");
  const root = await repository({
    "src/CMakeLists.txt": "cmake_minimum_required(VERSION 3.4)\n",
    "node_modules/CMakeLists.txt": "cmake_minimum_required(VERSION 2.8)\n",
    [`${deep}/CMakeLists.txt`]: "cmake_minimum_required(VERSION 3.4)\n",
  });
  await mkdir(join(root, "linked"));
  await symlink(join(root, "src", "CMakeLists.txt"), join(root, "linked", "CMakeLists.txt"));
  const findings = await cppDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => finding.location.path), ["src/CMakeLists.txt"]);
});

test("a repository without C or C++ manifests scans to nothing", async () => {
  assert.deepEqual(await cppDetector.analyze({ root: await repository({ "README.md": "x\n" }) }), { findings: [], unclassified: [] });
});

test("the engine attributes a C and C++ finding to the detector", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [cppDetector]);
  assert.deepEqual(result.findings.map((finding) => [finding.detector, finding.ruleId, finding.location.path, finding.location.line]), [["cpp", "cpp.cmake.policy-below-3.5.removed", "CMakeLists.txt", 1]]);
});

test("every curated C and C++ rule has migration guidance", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.length >= 1, rule.id);
  }
});

test("a migration packet for a CMake finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [cppDetector]);
  const finding = result.findings.find((item) => item.id === "cpp.cmake.policy-below-3.5.removed:CMakeLists.txt:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("CMakeLists.txt"));
  assert.ok(packet.steps.some((step) => step.id === "raise-cmake-policy-floor"));
  assert.ok(packet.verification.some((check) => check.command === "cmake -S . -B build"));
});

test("the detector is registered and C and C++ is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "cpp"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "cpp"), {
    id: "cpp",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["cpp"],
  });
});
