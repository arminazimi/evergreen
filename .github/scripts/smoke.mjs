// Smoke test for an Evergreen command, used after publishing and in the repository's own tests.
//
//   node smoke.mjs <fixture-directory> -- <command> [arguments...]
//
// Everything after `--` is the command that starts Evergreen, for example
// `npx --yes evergreen-deprecation@0.2.0` after a release or `node dist/src/cli.js` in a test. It runs
// `--help`, `capabilities`, and `scan` on the fixture, and fails if any of them fails or gives a result
// that a working package would not give. It needs nothing but Node.js and the command itself.

import { spawnSync } from "node:child_process";

const separator = process.argv.indexOf("--");
const fixture = process.argv[2];
const command = separator === -1 ? [] : process.argv.slice(separator + 1);
if (!fixture || separator !== 3 || command.length === 0) {
  console.error("Usage: smoke.mjs <fixture-directory> -- <command> [arguments...]");
  process.exit(2);
}

function run(args) {
  const [program, ...rest] = command;
  const result = spawnSync(program, [...rest, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, shell: process.platform === "win32" });
  if (result.error) throw new Error(`${[...command, ...args].join(" ")} could not run: ${result.error.message}`);
  return result;
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`ok: ${message}`);
}

const help = run(["--help"]);
expect(help.status === 0 && /evergreen/i.test(help.stdout), "--help runs and names the tool");

const capabilities = run(["capabilities", "--json"]);
let manifest;
try {
  manifest = JSON.parse(capabilities.stdout);
} catch {
  manifest = undefined;
}
expect(capabilities.status === 0 && typeof manifest?.schemaVersion === "string" && manifest.ecosystems?.length > 0, "capabilities prints a manifest with ecosystems");

const scan = run(["scan", fixture, "--json"]);
let result;
try {
  result = JSON.parse(scan.stdout);
} catch {
  result = undefined;
}
expect(result?.schemaVersion === "evergreen.scan.v1", `scan prints a scan result (exit ${scan.status})`);
const ruleIds = new Set((result?.findings ?? []).map((finding) => finding.ruleId));
expect(ruleIds.has("npm.package.request.deprecated"), "scan finds the deprecated package, so the rules shipped in the package");
expect([...ruleIds].some((id) => id.startsWith("nodejs.runtime.")), "scan finds the end-of-life Node.js range");
console.log("Smoke test passed.");
