import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { ElixirDetector, elixirDetector } from "../src/detectors/elixir/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/elixir");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-elixir-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/elixir.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    migration: rule.migration!,
    sources: rule.sources,
  };
}

test("elixir passes detector conformance on every fixture", async () => {
  const rules = await committedRules();
  const eol114 = rules.find((rule) => rule.id === "elixir.runtime.eol-1.14")!;
  const eol25 = rules.find((rule) => rule.id === "elixir.erlang.eol-25")!;
  const fennec = rules.find((rule) => rule.id === "elixir.package.fennec.retired")!;

  await runDetectorConformance({
    detector: elixirDetector,
    fixtures: [
      {
        name: "elixir positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(eol25, ".tool-versions", 2, `.tool-versions pins Erlang/OTP 25. ${eol25.summary}`),
          expected(eol114, ".tool-versions", 2, `.tool-versions pins Elixir 1.14.5. ${eol114.summary}`),
          expected(eol25, ".tool-versions", 3, `.tool-versions pins Erlang/OTP 25.3.2. ${eol25.summary}`),
          expected(eol114, "mix.exs", 8, `mix.exs declares Elixir 1.14.5. ${eol114.summary}`),
          expected(fennec, "mix.exs", 15, `mix.exs depends on fennec ~> 0.3.0. ${fennec.summary}`),
          expected(fennec, "mix.lock", 2, `mix.lock resolves fennec 0.3.0. ${fennec.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });

  await runDetectorConformance({
    detector: elixirDetector,
    fixtures: [
      { name: "elixir negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "elixir zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });

  await runDetectorConformance({
    detector: elixirDetector,
    fixtures: [{ name: "elixir malformed input", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("a mix.exs elixir constraint is not a version pin, and an exact pin is", async () => {
  const root = await repository({
    "mix.exs": "defmodule App.MixProject do\n  def project do\n    [\n      elixir: \"~> 1.14\"\n    ]\n  end\nend\n",
  });
  assert.deepEqual(await elixirDetector.scan({ root }), []);

  const pinned = await repository({
    "mix.exs": "defmodule App.MixProject do\n  def project do\n    [\n      elixir: \"1.14.5\"\n    ]\n  end\nend\n",
  });
  assert.deepEqual(
    (await elixirDetector.scan({ root: pinned })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [["elixir.runtime.eol-1.14", "mix.exs", 4]],
  );
});

test("mix.exs package constraints match only rules that cover every version", async () => {
  const detector = new ElixirDetector(async () => [
    {
      id: "elixir.package.example.range",
      ecosystem: "elixir",
      purl: "pkg:hex/example",
      vers: "vers:semver/<1.0.0",
      event: "deprecated",
      title: "example old line",
      summary: "Old line.",
      severity: "high",
      sources: [{ title: "Example", url: "https://example.com/example" }],
      provenance: { observedAt: "2026-10-26", reviewedAt: "2026-10-26", reviewer: "test" },
    },
    {
      id: "elixir.package.example.all",
      ecosystem: "elixir",
      purl: "pkg:hex/example",
      vers: "vers:semver/*",
      event: "deprecated",
      title: "example retired",
      summary: "Retired.",
      severity: "high",
      sources: [{ title: "Example", url: "https://example.com/example" }],
      provenance: { observedAt: "2026-10-26", reviewedAt: "2026-10-26", reviewer: "test" },
    },
  ]);
  const root = await repository({
    "mix.exs": "defmodule App.MixProject do\n  defp deps do\n    [\n      {:example, \"~> 0.1\"}\n    ]\n  end\nend\n",
  });
  assert.deepEqual(
    (await detector.scan({ root })).map((finding) => finding.ruleId),
    ["elixir.package.example.all"],
  );
});

test("a migration packet for an Elixir finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [elixirDetector]);
  const finding = result.findings.find((item) => item.id === "elixir.runtime.eol-1.14:.tool-versions:2");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes(".tool-versions"));
  assert.ok(packet.steps.some((step) => step.id === "update-elixir-declaration"));
  assert.ok(packet.verification.some((check) => check.command === "elixir --version"));
});

test("the detector is registered and Elixir is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "elixir"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "elixir"), {
    id: "elixir",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["elixir"],
  });
});
