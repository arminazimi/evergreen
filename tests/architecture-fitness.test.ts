import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import * as root from "../src/index.js";
import * as conformance from "../src/conformance/index.js";
import * as mcp from "../src/mcp.js";
import * as sdk from "../src/sdk.js";
import { BASELINE_PATH, RULES, buildGraph, findViolations, main } from "../tools/check-architecture.js";

// Architecture fitness tests: they fail, with a message that names the rule and the offending
// edge, when a layer rule, the public API shape, or the offline guarantee is broken.
// The offline guarantee itself is exercised at runtime by tests/offline.test.ts.

const roots: string[] = [];
after(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
});

const asFile = (prefix: string) => (prefix.endsWith("/") ? `${prefix}probe.ts` : prefix);
const asTarget = (prefix: string) => (prefix.endsWith("/") ? `${prefix}probe.ts` : prefix);

for (const rule of RULES) {
  test(`layer rule ${rule.id}: every forbidden import fails with a message naming the rule and the edge`, () => {
    assert.ok(rule.why.length > 10, "a rule explains why it exists");
    for (const from of rule.from) {
      for (const to of rule.to) {
        const importer = asFile(from);
        const target = asTarget(to);
        const graph = buildGraph(new Map([[importer, ""]]));
        graph.set(importer, [target]);
        assert.ok(
          findViolations(graph).includes(`${rule.id}: ${importer} -> ${target}`),
          `${rule.id} should reject ${importer} -> ${target}`,
        );
      }
    }
  });

  test(`layer rule ${rule.id}: an unrelated import is allowed`, () => {
    const graph = buildGraph(new Map([[asFile(rule.from[0]!), 'import { x } from "./unrelated-helper.js";']]));
    assert.deepEqual(
      findViolations(graph).filter((line) => line.startsWith(`${rule.id}:`)),
      [],
    );
  });
}

test("layer rule ids are unique", () => {
  const ids = RULES.map((rule) => rule.id);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test("a new violation in a real source tree fails the check with a clear message", () => {
  const directory = mkdtempSync(join(tmpdir(), "evergreen-arch-"));
  roots.push(directory);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  write("src/engine/detect.ts", 'import { d } from "../detectors/npm.js";\n');
  write("src/detectors/npm.ts", "export const d = 1;\n");
  write(BASELINE_PATH, JSON.stringify({ violations: [], cycles: [] }));

  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args.join(" "));
  try {
    assert.equal(main([], directory), 1);
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, [
    "new architecture violation: engine-no-detectors: src/engine/detect.ts -> src/detectors/npm.ts",
  ]);
});

const EXPORTS = {
  ".": {
    module: root,
    names: [
      "CHECK_SCHEMA_VERSION",
      "CheckDependencyError",
      "DETECTOR_API_VERSION",
      "DETECTOR_LIMITS",
      "DetectorCompatibilityError",
      "EvergreenAgentTools",
      "FindingNotObservedError",
      "MCP_TOOL_NAMES",
      "MigrationPacketValidationError",
      "RegistryValidationError",
      "analyzeSourceUsage",
      "assertDetectorCompatible",
      "capabilityManifestSchema",
      "checkDependency",
      "createEvergreenMcpServer",
      "createMigrationPacket",
      "defineDetector",
      "getCapabilityManifest",
      "isDeprecationRule",
      "isMigrationGuidance",
      "isUsageMatcher",
      "runGitHubAction",
      "scanRepository",
      "validateMigrationPacket",
      "validateRegistry",
    ],
  },
  "./sdk": {
    module: sdk,
    names: [
      "DETECTOR_API_VERSION",
      "DETECTOR_LIMITS",
      "DetectorCompatibilityError",
      "RegistryValidationError",
      "analyzeSourceUsage",
      "assertDetectorCompatible",
      "defineDetector",
      "isDeprecationRule",
      "isMigrationGuidance",
      "isUsageMatcher",
      "validateRegistry",
    ],
  },
  "./conformance": {
    module: conformance,
    names: ["CONFORMANCE_API_VERSION", "ConformanceError", "runDetectorConformance"],
  },
  "./mcp": {
    module: mcp,
    names: [
      "FINDING_URI_PREFIX",
      "MCP_OUTPUT_SCHEMA_FILES",
      "MCP_TOOL_ANNOTATIONS",
      "MCP_TOOL_NAMES",
      "createEvergreenMcpServer",
      "inlineSchemaReferences",
      "toolOutputSchema",
    ],
  },
} as const;

for (const [entry, { module, names }] of Object.entries(EXPORTS)) {
  test(`public API shape: the "${entry}" entry point exports exactly the documented names`, () => {
    const actual = Object.keys(module).sort();
    const expected: string[] = [...names];
    assert.deepEqual(
      actual.filter((name) => !expected.includes(name)),
      [],
      `${entry} exports names that are not part of the reviewed public API; add them here deliberately`,
    );
    assert.deepEqual(
      expected.filter((name) => !actual.includes(name)),
      [],
      `${entry} no longer exports names that are part of the public API (a breaking change)`,
    );
  });
}

test("public API shape: package.json exposes exactly the reviewed entry points", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(manifest.exports).sort(), [...Object.keys(EXPORTS), "./package.json"].sort());
});

test("public API shape: the root entry point re-exports the whole detector SDK", () => {
  for (const name of Object.keys(sdk)) {
    assert.ok(Reflect.has(root, name), `src/index.ts should re-export ${name} from the SDK`);
  }
});

test("offline guarantee: detectors and the core cannot import a network module", () => {
  const network = ["node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:dns"];
  const detectors = RULES.find((rule) => rule.id === "detectors-no-network");
  const core = RULES.find((rule) => rule.id === "core-no-fs-or-network");
  for (const module of network) {
    assert.ok(detectors?.to.includes(module), `detectors-no-network should forbid ${module}`);
    assert.ok(core?.to.includes(module), `core-no-fs-or-network should forbid ${module}`);
  }
});
