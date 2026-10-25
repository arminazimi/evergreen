import assert from "node:assert/strict";
import { test } from "node:test";

import { diagnoseEnvironment, diagnoseSystem, renderDoctorText } from "../src/doctor.js";
import type { VersionRunner } from "../src/doctor.js";

const outputs: Record<string, string> = {
  node: "v20.11.1\n",
  python3: "Python 3.12.4\n",
  go: "go version go1.25.2 darwin/arm64\n",
  java: 'openjdk version "19.0.2" 2023-01-17\nOpenJDK Runtime Environment\n',
  dotnet: "9.0.100\n",
  terraform: "Terraform v1.14.1\non darwin_arm64\n",
};

function runner(available: Record<string, string>, calls: string[] = []): VersionRunner {
  return async (command, args) => {
    calls.push([command, ...args].join(" "));
    return available[command];
  };
}

test("system check lists each tool, its line, and its status", async () => {
  const calls: string[] = [];
  const system = await diagnoseSystem({ versionRunner: runner(outputs, calls) });
  const byTool = Object.fromEntries(system.map((entry) => [entry.tool, entry]));

  assert.deepEqual(system.map((entry) => entry.tool), ["node", "python3", "go", "java", "dotnet", "terraform"]);
  assert.equal(byTool.node?.version, "20.11.1");
  assert.equal(byTool.node?.line, "20");
  assert.equal(byTool.node?.status, "end-of-life");
  assert.equal(byTool.node?.ruleId, "nodejs.runtime.eol-20");
  assert.equal(byTool.python3?.line, "3.12");
  assert.equal(byTool.python3?.status, "supported");
  assert.equal(byTool.go?.status, "end-of-life");
  assert.equal(byTool.java?.line, "19");
  assert.equal(byTool.java?.status, "end-of-life");
  assert.equal(byTool.dotnet?.line, "9.0");
  assert.equal(byTool.dotnet?.status, "scheduled-end-of-life");
  assert.equal(byTool.terraform?.status, "end-of-life");

  assert.deepEqual(calls, [
    "node --version",
    "python3 --version",
    "go version",
    "java -version",
    "dotnet --version",
    "terraform --version",
  ]);
});

test("system check skips tools that are not installed", async () => {
  const system = await diagnoseSystem({ versionRunner: runner({ node: outputs.node! }) });
  assert.deepEqual(system.map((entry) => entry.tool), ["node"]);
  assert.deepEqual(await diagnoseSystem({ versionRunner: runner({}) }), []);
});

test("system check ignores output it cannot read and understands Java 8", async () => {
  const system = await diagnoseSystem({
    versionRunner: runner({ node: "not a version", java: 'java version "1.8.0_292"\n' }),
  });
  assert.deepEqual(system.map((entry) => `${entry.tool} ${entry.version}`), ["java 8.0.0"]);
});

test("doctor adds system checks as warnings only when asked", async () => {
  const base = { environment: {}, nodeVersion: "22.12.0", platform: "linux" as const };
  const without = await diagnoseEnvironment(".", { ...base, versionRunner: runner(outputs) });
  assert.equal(without.system, undefined);
  assert.equal(without.checks.some((check) => check.category === "system"), false);

  const withSystem = await diagnoseEnvironment(".", { ...base, system: true, versionRunner: runner(outputs) });
  const checks = withSystem.checks.filter((check) => check.category === "system");
  assert.equal(checks.length, 6);
  assert.equal(checks.find((check) => check.id === "system.python3")?.status, "pass");
  assert.equal(checks.find((check) => check.id === "system.node")?.status, "warning");
  assert.equal(withSystem.system?.length, 6);
  assert.match(renderDoctorText(withSystem), /\[WARN\] system: node 20\.11\.1 \(line 20\) is out of support/);
});
