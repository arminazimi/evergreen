import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import type { Finding } from "../src/domain.js";
import type { RegistryV2Rule } from "../src/registry.js";
import {
  buildRenovatePreset,
  isRenovatePackageName,
  RENOVATE_SCHEMA,
  renovatePackageName,
} from "../src/renovate-preset.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(ruleId: string, replacement?: string): Finding {
  return {
    id: `${ruleId}:pkg`,
    ruleId,
    detector: "npm",
    title: "t",
    summary: "s",
    severity: "high",
    confidence: "exact",
    location: { path: "package.json", line: 1 },
    sources: [],
    ...(replacement ? { replacement } : {}),
  };
}

function rule(partial: Partial<RegistryV2Rule> & Pick<RegistryV2Rule, "id" | "purl">): RegistryV2Rule {
  return {
    ecosystem: "npm",
    vers: "vers:npm/*",
    event: "deprecated",
    title: "t",
    summary: "s",
    severity: "high",
    sources: [{ title: "s", url: "https://example.com" }],
    provenance: { observedAt: "2026-01-01", reviewedAt: "2026-01-01", reviewer: "test" },
    ...partial,
  };
}

test("isRenovatePackageName accepts registry names and rejects prose", () => {
  assert.equal(isRenovatePackageName("sass"), true);
  assert.equal(isRenovatePackageName("@babel/preset-env"), true);
  assert.equal(isRenovatePackageName("Native fetch"), false);
  assert.equal(isRenovatePackageName("URLSearchParams"), false);
  assert.equal(isRenovatePackageName("Array.prototype.sort"), false);
});

test("renovatePackageName reads scoped and unscoped PURLs", () => {
  assert.equal(renovatePackageName("pkg:npm/node-sass"), "node-sass");
  assert.equal(renovatePackageName("pkg:npm/%40hapi/joi"), "@hapi/joi");
  assert.equal(renovatePackageName("pkg:github/actions/checkout"), "actions/checkout");
});

test("buildRenovatePreset emits replacement and runtime rules and skips prose", () => {
  const rules = [
    rule({ id: "npm.package.node-sass.eol", purl: "pkg:npm/node-sass", replacement: "sass" }),
    rule({ id: "npm.package.request.deprecated", purl: "pkg:npm/request", replacement: "Native fetch or a maintained HTTP client" }),
    rule({
      id: "nodejs.runtime.eol-18",
      ecosystem: "nodejs",
      purl: "pkg:generic/nodejs",
      replacement: "Node.js 22 LTS or later",
      "x-nodejs": { major: 18 },
    }),
    rule({
      id: "python.runtime.eol-3.9-and-older",
      ecosystem: "python",
      purl: "pkg:generic/python",
      replacement: "A supported Python release",
      "x-python": { kind: "runtime", maximumVersion: "3.9" },
    }),
  ];
  const preset = buildRenovatePreset(
    [
      finding("npm.package.node-sass.eol", "sass"),
      finding("npm.package.request.deprecated", "Native fetch or a maintained HTTP client"),
      finding("nodejs.runtime.eol-18", "Node.js 22 LTS or later"),
      finding("python.runtime.eol-3.9-and-older", "A supported Python release"),
    ],
    rules,
  );
  assert.equal(preset.$schema, RENOVATE_SCHEMA);
  assert.deepEqual(
    preset.packageRules.map((item) => [
      item.matchPackageNames[0],
      item.replacementName ?? item.allowedVersions,
    ]),
    [
      ["python", ">=3.10.0"],
      ["node", ">=22"],
      ["node-sass", "sass"],
    ],
  );
});

test("runtime pins keep the highest floor when several findings apply", () => {
  const rules = [
    rule({
      id: "nodejs.runtime.eol-18",
      ecosystem: "nodejs",
      purl: "pkg:generic/nodejs",
      replacement: "Node.js 22 LTS or later",
    }),
    rule({
      id: "nodejs.runtime.eol-22",
      ecosystem: "nodejs",
      purl: "pkg:generic/nodejs",
      replacement: "Node.js 24 LTS or later",
    }),
  ];
  const preset = buildRenovatePreset(
    [
      finding("nodejs.runtime.eol-18", "Node.js 22 LTS or later"),
      finding("nodejs.runtime.eol-22", "Node.js 24 LTS or later"),
    ],
    rules,
  );
  assert.deepEqual(preset.packageRules, [
    {
      description: "Evergreen: keep Node.js on a supported release (nodejs.runtime.eol-22)",
      matchDatasources: ["node-version"],
      matchPackageNames: ["node"],
      allowedVersions: ">=24",
    },
  ]);
});

test("buildRenovatePreset is deterministic for the same findings in any order", () => {
  const rules = [
    rule({ id: "npm.package.jade.deprecated", purl: "pkg:npm/jade", replacement: "pug" }),
    rule({ id: "npm.package.node-sass.eol", purl: "pkg:npm/node-sass", replacement: "sass" }),
  ];
  const a = [finding("npm.package.node-sass.eol", "sass"), finding("npm.package.jade.deprecated", "pug")];
  const b = [...a].reverse();
  assert.deepEqual(buildRenovatePreset(a, rules), buildRenovatePreset(b, rules));
});

test("the renovate-preset command prints JSON only and does not write config", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-renovate-"));
  roots.push(directory);
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "demo", dependencies: { "node-sass": "4.14.1" } }),
  );
  const { stdout, stderr } = await execute(process.execPath, [cli, "renovate-preset", directory]);
  assert.equal(stderr, "");
  const preset = JSON.parse(stdout) as { $schema: string; packageRules: Array<{ replacementName?: string }> };
  assert.equal(preset.$schema, RENOVATE_SCHEMA);
  assert.ok(preset.packageRules.some((rule) => rule.replacementName === "sass"));
  await assert.rejects(access(join(directory, "renovate.json")));
});
