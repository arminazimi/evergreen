import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { NpmDetector } from "../src/detectors/npm/index.js";
import { renderFindingText } from "../src/reporters.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-npm-transitive-"));
  temporaryRoots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const absolutePath = join(root, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
  return root;
}

const manifest = JSON.stringify({ dependencies: { "web-kit": "^1.0.0" } }, null, 2);
const expectedPath = ["web-kit", "http-layer", "request"];

async function transitiveFinding(files: Record<string, string>) {
  const root = await repository({ "package.json": manifest, ...files });
  const findings = await new NpmDetector().scan({ root });
  return findings.filter((finding) => finding.ruleId.includes("request"));
}

test("reports the shortest path to a deprecated package from package-lock.json", async () => {
  const findings = await transitiveFinding({
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "web-kit": "^1.0.0" } },
        "node_modules/web-kit": { version: "1.0.0", dependencies: { "http-layer": "^2.0.0", "other-layer": "^1.0.0" } },
        "node_modules/http-layer": { version: "2.0.0", dependencies: { request: "^2.88.0" } },
        "node_modules/other-layer": { version: "1.0.0", dependencies: { "http-layer": "^2.0.0" } },
        "node_modules/request": { version: "2.88.2" },
      },
    }),
  });

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0]?.dependencyPath, expectedPath);
  assert.equal(findings[0]?.location.path, "package.json");
  assert.match(findings[0]?.summary ?? "", /not declared directly; web-kit/);
});

test("reports the path from a pnpm lockfile", async () => {
  const findings = await transitiveFinding({
    "pnpm-lock.yaml": [
      "lockfileVersion: '9.0'",
      "snapshots:",
      "  web-kit@1.0.0:",
      "    dependencies:",
      "      http-layer: 2.0.0",
      "  http-layer@2.0.0:",
      "    dependencies:",
      "      request: 2.88.2",
      "  request@2.88.2: {}",
      "",
    ].join("\n"),
  });

  assert.deepEqual(findings[0]?.dependencyPath, expectedPath);
});

test("reports the path from a Yarn lockfile", async () => {
  const findings = await transitiveFinding({
    "yarn.lock": [
      '"web-kit@^1.0.0":',
      '  version "1.0.0"',
      "  dependencies:",
      '    http-layer "^2.0.0"',
      "",
      '"http-layer@^2.0.0":',
      '  version "2.0.0"',
      "  dependencies:",
      '    request "^2.88.0"',
      "",
      '"request@^2.88.0":',
      '  version "2.88.2"',
      "",
    ].join("\n"),
  });

  assert.deepEqual(findings[0]?.dependencyPath, expectedPath);
});

test("prints the path in text output and keeps direct findings free of it", async () => {
  const findings = await transitiveFinding({
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/web-kit": { version: "1.0.0", dependencies: { "http-layer": "^2.0.0" } },
        "node_modules/http-layer": { version: "2.0.0", dependencies: { request: "^2.88.0" } },
        "node_modules/request": { version: "2.88.2" },
      },
    }),
  });
  const text = renderFindingText({ ...findings[0]!, detector: "npm", confidence: "inferred-from-lock" });
  assert.match(text, /Path: web-kit > http-layer > request/);

  const root = await repository({
    "package.json": JSON.stringify({ dependencies: { request: "^2.88.0" } }),
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/request": { version: "2.88.2" } },
    }),
  });
  const direct = await new NpmDetector().scan({ root });
  assert.equal(direct[0]?.dependencyPath, undefined);
});

test("reports nothing when the lockfile does not reach the package from a declared dependency", async () => {
  const findings = await transitiveFinding({
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/web-kit": { version: "1.0.0" },
        "node_modules/request": { version: "2.88.2" },
      },
    }),
  });
  assert.equal(findings.length, 0);
});

test("reports the path from a bun.lock, reading aliases, peer suffixes, and keys when the descriptor is missing", async () => {
  const findings = await transitiveFinding({
    "bun.lock": JSON.stringify({
      lockfileVersion: 1,
      packages: {
        "web-kit": ["web-kit@1.0.0(peer@1.0.0)", "", { dependencies: { "http-layer": "^2.0.0" } }, "sha512-a"],
        "http-layer": ["alias@npm:http-layer@2.0.0", "", { dependencies: { request: "^2.88.0" } }, "sha512-b"],
        "request@2.88.2": [7, ""],
        unparsable: ["unparsable", ""],
        empty: [],
        "not-an-array": "request@2.88.2",
      },
    }),
  });

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0]?.dependencyPath, expectedPath);
});

test("reads a bun.lock descriptor with an npm: alias on the version", async () => {
  const findings = await transitiveFinding({
    "bun.lock": JSON.stringify({
      packages: {
        "web-kit": ["web-kit@npm:1.0.0", "", { dependencies: { "http-layer": "^2.0.0" } }],
        "http-layer": ["npm:http-layer@2.0.0", "", { dependencies: { request: "^2.88.0" } }],
        request: ["request@2.88.2", "", {}],
      },
    }),
  });

  assert.deepEqual(findings[0]?.dependencyPath, expectedPath);
});

test("a bun.lock that is not a lockfile resolves nothing and does not fail the scan", async () => {
  for (const contents of [
    "{ not json",
    "null",
    "42",
    "{}",
    '{"packages":1}',
    '{"packages":{"request":["request@2.88.2"]}}',
  ]) {
    const root = await repository({
      "package.json": JSON.stringify({ dependencies: { request: "^2.88.0" } }),
      "bun.lock": contents,
    });
    const findings = await new NpmDetector().scan({ root });
    assert.ok(
      findings.some((finding) => finding.ruleId.includes("request")),
      `request is still reported for ${contents}`,
    );
  }
});
