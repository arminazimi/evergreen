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
import { RustDetector } from "../src/detectors/rust/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/rust");
const temporaryRoots: string[] = [];
const detector = new RustDetector();

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rust-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/rust.json", "utf8"))).rules;
}

async function expected(ruleId: string, path: string, line: number, summary: (rule: RegistryV2Rule) => string): Promise<DetectorFinding> {
  const rule = (await committedRules()).find((item) => item.id === ruleId)!;
  // A rule with usage matchers reports where the source uses the crate, even when nowhere.
  const usage = (rule.usage ?? []).length > 0 ? { usages: [], impact: { usageCount: 0, affectedFiles: 0, level: "none" as const } } : {};
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

test("rust passes detector conformance on every fixture", async () => {
  const crate = (id: string, path: string, line: number, text: string) => expected(id, path, line, (rule) => `${path} declares ${text}. ${rule.summary}`);
  const toolchain = (path: string, line: number, version: string) => expected("rust.toolchain.end-of-support-1.98-and-older", path, line, (rule) => `${path} pins Rust ${version}. ${rule.summary}`);
  await runDetectorConformance({
    detector,
    fixtures: [
      {
        name: "rust positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          crate("rust.crate.failure.unmaintained", "Cargo.toml", 8, "failure 0.1.8 in dependencies"),
          crate("rust.crate.tempdir.unmaintained", "Cargo.toml", 9, "tempdir 0.3 in dependencies"),
          crate("rust.crate.atty.unmaintained", "Cargo.toml", 11, "atty 0.2.14 (as console) in dependencies"),
          crate("rust.crate.ansi-term.unmaintained", "Cargo.toml", 14, "ansi_term 0.12 in dev-dependencies"),
          toolchain("legacy/rust-toolchain", 1, "1.65.0"),
          toolchain("rust-toolchain.toml", 2, "1.70.0"),
          crate("rust.crate.failure.unmaintained", "workspace/Cargo.toml", 8, "failure 0.1 in workspace"),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [
      { name: "rust negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "rust zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [{ name: "rust malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("edition, rust-version, and a moving or non-release channel are never findings; odd channels are unclassified", async () => {
  const root = await repository({
    "Cargo.toml": '[package]\nname = "a"\nedition = "2015"\nrust-version = "1.30"\n',
    "rust-toolchain.toml": '[toolchain]\nchannel = "nightly-2022-01-01"\n',
    "stable/rust-toolchain.toml": '[toolchain]\nchannel = "stable"\n',
    "beta/rust-toolchain": "beta\n",
  });
  const analysis = await detector.analyze({ root });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified.map((item) => [item.location.path, item.reference]), [["beta/rust-toolchain", "beta"], ["rust-toolchain.toml", "nightly-2022-01-01"]]);
});

test("the newest supported release and newer are not reported, and a two-part release is read as x.y.0", async () => {
  const root = await repository({ "a/rust-toolchain": "1.99.0\n", "b/rust-toolchain": "1.100\n", "c/rust-toolchain": "1.98\n" });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.location.path), ["c/rust-toolchain"]);
});

const yankedRule: RegistryV2Rule = {
  id: "rust.crate.bytes.yanked",
  ecosystem: "rust",
  purl: "pkg:cargo/bytes",
  vers: "vers:cargo/0.5.0|0.5.1|1.6.0",
  event: "removed",
  title: "4 versions of bytes are yanked",
  summary: "crates.io lists these versions of bytes as yanked.",
  severity: "medium",
  replacement: "A version of bytes that is not yanked",
  sources: [{ title: "bytes on crates.io", url: "https://crates.io/crates/bytes/versions" }],
  provenance: { observedAt: "2026-10-17", reviewedAt: "2026-10-17", reviewer: "test" },
};

const lockEntry = (name: string, version: string) => `[[package]]\nname = "${name}"\nversion = "${version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;

test("a yanked version is reported at its Cargo.lock line, only for a crate a Cargo.toml under it declares directly", async () => {
  const root = await repository({
    "Cargo.toml": '[workspace]\nmembers = ["app"]\n',
    "app/Cargo.toml": '[package]\nname = "app"\n\n[dependencies]\nbytes = "1"\n',
    "Cargo.lock": `version = 3\n\n${lockEntry("bytes", "1.6.0")}\n${lockEntry("memchr", "2.3.1")}`,
  });
  const findings = await new RustDetector(async () => [yankedRule]).scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["rust.crate.bytes.yanked", "Cargo.lock", 5]]);
  assert.match(findings[0]!.summary, /Cargo\.lock resolves bytes 1\.6\.0, which is yanked/);

  const notYanked = await repository({ "Cargo.toml": '[dependencies]\nbytes = "1"\n', "Cargo.lock": `version = 3\n\n${lockEntry("bytes", "1.7.0")}` });
  assert.deepEqual(await new RustDetector(async () => [yankedRule]).scan({ root: notYanked }), []);

  const transitive = await repository({ "Cargo.toml": '[dependencies]\nserde = "1"\n', "Cargo.lock": `version = 3\n\n${lockEntry("bytes", "1.6.0")}` });
  assert.deepEqual(await new RustDetector(async () => [yankedRule]).scan({ root: transitive }), [], "bytes is not declared directly");
});

test("path, git, workspace, and dynamic dependencies are not matched, and a renamed one is matched by its real crate", async () => {
  const root = await repository({
    "Cargo.toml": '[dependencies]\nfailure = { path = "../failure" }\ntempdir = { git = "https://example.com/tempdir" }\natty = { workspace = true }\nansi_term = "${V}"\nconsole = { package = "atty", version = "0.2" }\n',
  });
  assert.deepEqual((await detector.scan({ root })).map((finding) => [finding.ruleId, finding.location.line]), [["rust.crate.atty.unmaintained", 6]]);
});

test("nested crates are found, vendored and fixture directories and symbolic links are skipped, and a repository without Rust files is empty", async () => {
  const root = await repository({
    "crates/a/Cargo.toml": '[dependencies]\nfailure = "0.1"\n',
    "target/debug/Cargo.toml": '[dependencies]\nfailure = "0.1"\n',
    "vendor/x/Cargo.toml": '[dependencies]\nfailure = "0.1"\n',
    "tests/fixtures/old/Cargo.toml": '[dependencies]\nfailure = "0.1"\n',
  });
  await symlink(join(root, "crates"), join(root, "linked")).catch(() => undefined);
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.location.path), ["crates/a/Cargo.toml"]);
  assert.deepEqual(await detector.analyze({ root: await repository({ "README.md": "x\n" }) }), { findings: [], unclassified: [] });
});

import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";

test("every curated Rust rule has migration guidance with real verification commands", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.some((check) => /^(?:rustc --version|cargo build --all-targets && cargo test)/.test(check.command)), rule.id);
  }
});

test("a migration packet for a Rust finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [detector]);
  const toolchain = result.findings.find((finding) => finding.id === "rust.toolchain.end-of-support-1.98-and-older:rust-toolchain.toml:2");
  assert.ok(toolchain);
  const packet = validateMigrationPacket(createMigrationPacket(result, toolchain.id));
  assert.ok(packet.affectedFiles.includes("rust-toolchain.toml"));
  assert.ok(packet.steps.some((step) => step.id === "update-toolchain-pin"));
  assert.ok(packet.verification.some((check) => check.command === "cargo build --all-targets && cargo test"));

  const crate = result.findings.find((finding) => finding.ruleId === "rust.crate.atty.unmaintained")!;
  const cratePacket = validateMigrationPacket(createMigrationPacket(result, crate.id));
  assert.ok(cratePacket.steps.some((step) => step.id === "replace-atty"));
});
