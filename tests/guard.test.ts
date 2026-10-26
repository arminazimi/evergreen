import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { DependencyCheck } from "../src/check-dependency.js";
import type { Severity } from "../src/domain.js";
import { evaluateGuard, guardCommand, parseGuardArgs, parseNpmInstall, parseNpmPackage } from "../src/guard.js";
import type { GuardPackage, GuardRequest } from "../src/guard.js";

const cli = resolve("dist/src/cli.js");

function noData(purl: string): DependencyCheck {
  return {
    schemaVersion: "evergreen.check.v1",
    purl,
    status: "no-data",
    findings: [],
    message: `${purl}: Evergreen has no lifecycle rule for this package.`,
  };
}

function affected(purl: string, severity: Severity = "high"): DependencyCheck {
  return {
    schemaVersion: "evergreen.check.v1",
    purl,
    status: "affected",
    severity,
    findings: [
      {
        ruleId: "test.rule",
        ecosystem: purl.split("/")[0]!.replace("pkg:", ""),
        event: "deprecated",
        severity,
        title: "test package is deprecated",
        summary: "Use the replacement.",
        replacement: "the replacement",
        affectedVersions: "vers:npm/*",
        sources: [{ title: "Source", url: "https://example.test/source" }],
      },
    ],
    message: `${purl}: test package is deprecated.`,
  };
}

test("a deprecated npm package is refused with its replacement and npm is not run", async () => {
  let ran = false;
  const result = await guardCommand(["npm", "install", "request@2.88.2"], {
    run: () => {
      ran = true;
      return 0;
    },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.exitCode, 1);
  assert.equal(ran, false);
  assert.equal(result.blockers.length, 1);
  assert.match(result.output, /refused to run/);
  assert.match(result.output, /request is deprecated/);
  assert.match(result.output, /Replacement: Native fetch or a maintained HTTP client/);
  assert.match(result.output, /Evidence: https:\/\/www\.npmjs\.com\/package\/request/);
  assert.match(result.output, /--force/);
});

test("the lower bound of a version range is the version that is judged", async () => {
  const result = await guardCommand(["npm", "install", "request@^2.88.2"], { run: () => 0 });
  assert.equal(result.allowed, false);
  assert.match(result.output, /pkg:npm\/request@2\.88\.2/);
});

test("an allowed install reaches npm with the package arguments unchanged", async () => {
  const runs: GuardRequest[] = [];
  const result = await guardCommand(["npm", "install", "--save-dev", "express@4.18.0", "left-pad@1.3.0"], {
    check: async (entry: GuardPackage) => noData(entry.purl),
    run: (request) => {
      runs.push(request);
      return 7;
    },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.exitCode, 7);
  assert.equal(result.output, "");
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.command, "npm");
  assert.deepEqual(runs[0]!.args, ["install", "--save-dev"]);
  assert.deepEqual(
    runs[0]!.packages.map((entry) => entry.spec),
    ["express@4.18.0", "left-pad@1.3.0"],
  );
});

test("npm install without package arguments is not checked", async () => {
  let checked = false;
  const result = await guardCommand(["npm", "install"], {
    check: async () => {
      checked = true;
      return noData("pkg:npm/unused");
    },
    run: () => 3,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.exitCode, 3);
  assert.equal(checked, false);
});

test("--fail-on decides which severities block and --force overrides the decision", async () => {
  const entry: GuardPackage = { purl: "pkg:npm/example", version: "1.0.0", spec: "example@1.0.0" };
  const medium = [{ package: entry, check: affected(entry.purl, "medium") }];
  assert.equal(evaluateGuard(medium, { failOn: "high" }).allowed, true);
  assert.equal(evaluateGuard(medium, { failOn: "medium" }).allowed, false);
  assert.equal(evaluateGuard([{ package: entry, check: affected(entry.purl, "critical") }], { failOn: "none" }).allowed, true);

  let ran = 0;
  const permissive = await guardCommand(["npm", "install", "request@2.88.2", "--fail-on", "critical"], {
    run: () => {
      ran += 1;
      return 0;
    },
  });
  assert.equal(permissive.allowed, true);
  assert.equal(ran, 1);

  const runs: GuardRequest[] = [];
  const forced = await guardCommand(["npm", "install", "request@2.88.2", "--fail-on", "high", "--force"], {
    run: (request) => {
      runs.push(request);
      return 0;
    },
  });
  assert.equal(forced.allowed, true);
  assert.equal(forced.blockers.length, 1);
  assert.match(forced.output, /--force was given/);
  assert.match(forced.output, /Replacement: Native fetch/);
  assert.equal(runs.length, 1);
  assert.deepEqual(
    runs[0]!.packages.map((item) => item.spec),
    ["request@2.88.2"],
  );
});

test("npm specs become purls with checkable versions, and non-registry arguments are forwarded", () => {
  const request = parseNpmInstall([
    "install",
    "--save-dev",
    "@scope/pkg@^1.2.3",
    "request@2.88.2",
    "express",
    "./local",
    "https://example.test/x.tgz",
    "alias@npm:other@1.0.0",
  ]);
  assert.equal(request.command, "npm");
  assert.deepEqual(request.args, ["install", "--save-dev", "./local", "https://example.test/x.tgz", "alias@npm:other@1.0.0"]);
  assert.deepEqual(request.packages, [
    { purl: "pkg:npm/%40scope/pkg", version: "1.2.3", spec: "@scope/pkg@^1.2.3" },
    { purl: "pkg:npm/request", version: "2.88.2", spec: "request@2.88.2" },
    { purl: "pkg:npm/express", spec: "express" },
  ]);
  assert.deepEqual(parseNpmPackage("@scope/pkg"), { purl: "pkg:npm/%40scope/pkg", spec: "@scope/pkg" });
  assert.equal(parseNpmPackage("file:../local"), undefined);
  assert.equal(parseNpmPackage("./local"), undefined);
});

test("a package that cannot be checked blocks the install", async () => {
  let ran = false;
  const result = await guardCommand(["npm", "install", "request@2.88.2"], {
    check: async () => {
      throw new Error("rules unavailable");
    },
    run: () => {
      ran = true;
      return 0;
    },
  });
  assert.equal(result.allowed, false);
  assert.equal(ran, false);
  assert.match(result.output, /could not check \(rules unavailable\)/);
});

test("unsupported managers, install commands, and gates are usage errors", () => {
  assert.throws(() => parseGuardArgs(["pip", "install", "nose"]), /Unsupported package manager "pip"/);
  assert.throws(() => parseGuardArgs(["npm", "ci"]), /Expected `npm install`/);
  assert.throws(() => parseGuardArgs(["npm", "install", "request", "--fail-on", "urgent"]), /--fail-on needs one of/);
  assert.throws(() => parseGuardArgs([]), /Missing package manager/);
});

test("the CLI refuses a deprecated package before npm runs", () => {
  const cwd = mkdtempSync(join(tmpdir(), "evergreen-guard-"));
  try {
    const result = spawnSync(process.execPath, [cli, "guard", "npm", "install", "request@2.88.2"], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /refused to run/);
    assert.match(result.stderr, /Replacement: Native fetch or a maintained HTTP client/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("the CLI reports a guard usage error as a usage failure", () => {
  const result = spawnSync(process.execPath, [cli, "guard", "pip", "install", "nose"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unsupported package manager/);
});
